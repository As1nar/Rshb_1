"""Run: python -m unittest discover -s tests -v (no model downloads)."""
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main
from unittest.mock import patch
from types import SimpleNamespace
import time
import numpy as np
from fastapi.testclient import TestClient
from PIL import Image
import backend_main as backend


def png(alpha=False):
    output=BytesIO()
    Image.new('RGBA' if alpha else 'RGB', (700,800), (50,80,20,0) if alpha else 'green').save(output,format='PNG')
    return output.getvalue()


class ProjectAPI(TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=TemporaryDirectory()
        cls.base=Path(cls.temp.name)
        cls.original=(backend.BASE,backend.UPLOADS,backend.RESULTS)
        backend.BASE=cls.base
        backend.UPLOADS=cls.base/'uploads';backend.UPLOADS.mkdir()
        backend.RESULTS=cls.base/'results';backend.RESULTS.mkdir()
        cls.context=TestClient(backend.app)
        cls.client=cls.context.__enter__()

    @classmethod
    def tearDownClass(cls):
        cls.context.__exit__(None,None,None)
        backend.BASE,backend.UPLOADS,backend.RESULTS=cls.original
        cls.temp.cleanup()

    def create(self,**options):
        response=self.client.post('/api/projects',files={'product_image':('photo.png',png(),'image/png')},data={
            'remove_product_background':'false','use_ocr':'false','use_vision':'false',**options})
        self.assertEqual(response.status_code,202,response.text)
        return self.wait(response.json()['id'])

    def wait(self,identifier):
        for _ in range(100):
            p=self.client.get('/api/projects/'+identifier).json()
            if p['job']['status'] not in {'queued','running'}:
                self.assertEqual(p['job']['status'],'done',p)
                return p
            time.sleep(.01)
        self.fail('Background task did not finish')

    def test_manual_flow_and_persistent_scene_order(self):
        p=self.create()
        self.assertEqual(len(p['assets']),1)
        self.assertEqual(p['recognition']['text'],[])
        payload={'product':{'category':'Мёд','name':'Цветочный мёд','description':'Мёд, 250 г.',
            'confirmed':True,'facts':[{'label':'Масса / объём','value':'250 г','confirmed':True},{'label':'Состав','value':'Мёд','confirmed':True}]},
            'settings':{'style':'organic'},'scenes':[{'id':'s1','nodes':[{'id':'back','type':'shape'},{'id':'front','type':'text','text':'Мёд'}]}]}
        response=self.client.put('/api/projects/'+p['id'],json=payload)
        self.assertEqual(response.status_code,200,response.text)
        self.assertEqual(response.json()['assessment']['score'],100)
        restored=self.client.get('/api/projects/'+p['id']).json()
        self.assertEqual(restored['scenes'][0]['nodes'][1]['id'],'front')
        self.assertEqual(restored['assessment']['missing_fields'],[])

    def test_invalid_upload_not_trusted_by_mime(self):
        before=len(list(backend.UPLOADS.iterdir()))
        result=self.client.post('/api/projects',files={'product_image':('bad.png',b'not an image','image/png')})
        self.assertEqual(result.status_code,415)
        self.assertEqual(len(list(backend.UPLOADS.iterdir())),before)

    def test_non_png_without_removal_is_supported(self):
        raw=BytesIO();Image.new('RGB',(50,60),'red').save(raw,format='JPEG')
        result=self.client.post('/api/projects',files={'product_image':('a.jpg',raw.getvalue(),'image/jpeg')},data={'remove_product_background':'false','use_ocr':'false','use_vision':'false'})
        self.assertEqual(result.status_code,202)
        self.wait(result.json()['id'])

    def test_real_ocr_adapter_receives_original_rgb_array(self):
        seen=[]
        class Reader:
            def __init__(self,*args,**kwargs):pass
            def readtext(self,image,**kwargs):
                assert isinstance(image,np.ndarray)
                assert image.shape==(800,700,3)
                seen.append(True)
                return [([[0,0],[100,0],[100,30],[0,30]],'Мёд 250 г',.83)]
        old=backend.ocr_reader;backend.ocr_reader=None
        try:
            with patch.dict('sys.modules',{'easyocr':SimpleNamespace(Reader=Reader)}):
                p=self.create(use_ocr='true')
            self.assertTrue(seen)
            self.assertEqual(p['recognition']['text'][0]['confidence'],.83)
            self.assertEqual(p['recognition']['categories'][0]['category'],'Мёд')
            self.assertFalse(p['product']['confirmed'])
        finally:backend.ocr_reader=old

    def test_missing_ocr_is_reported_and_manual_flow_survives(self):
        old=backend.ocr_reader;backend.ocr_reader=None
        try:
            with patch.dict('sys.modules',{'easyocr':None}):
                p=self.create(use_ocr='true')
            self.assertTrue(any('OCR недоступен' in w for w in p['job']['warnings']))
            self.assertEqual(p['job']['completed'],p['job']['total'])
        finally:backend.ocr_reader=old

    def test_background_pipeline_uses_cutout_and_keeps_original(self):
        def cutout(image,**kwargs):
            im=Image.new('RGBA',image.size)
            im.paste('green',(100,100,500,700))
            return im
        old=backend.background_session;backend.background_session=None
        try:
            with patch.dict('sys.modules',{'rembg':SimpleNamespace(new_session=lambda _:object(),remove=cutout)}):
                p=self.create(remove_product_background='true')
            a=p['assets'][0]
            self.assertNotEqual(a['url'],a['original'])
            self.assertEqual((a['width'],a['height']),(400,600))
            self.assertTrue((backend.BASE/a['original'].lstrip('/')).exists())
        finally:backend.background_session=old

    def test_unconfirmed_fact_does_not_complete_requirements(self):
        p=self.create()
        response=self.client.put('/api/projects/'+p['id'],json={'product':{'category':'Мёд','facts':[{'label':'Состав','value':'Мёд','confirmed':False}]}})
        a=response.json()['assessment']
        self.assertIn('Состав',a['missing_fields'])
        self.assertTrue(any('неподтверждённые' in w for w in a['warnings']))

    def test_validation_and_retry(self):
        self.assertEqual(self.client.get('/api/projects/not-a-uuid').status_code,404)
        p=self.create()
        self.assertEqual(self.client.put('/api/projects/'+p['id'],json={'product':{},'scenes':[{'nodes':[{}]*101}]}).status_code,422)
        response=self.client.post('/api/projects/'+p['id']+'/retry')
        self.assertEqual(response.status_code,202)
        self.wait(p['id'])

if __name__=='__main__':main()
