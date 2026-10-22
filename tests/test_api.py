"""Run: python -m unittest discover -s tests -v (no model downloads)."""
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import TestCase, main
from unittest.mock import patch
from types import SimpleNamespace
import time
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
            'remove_product_background':'false','use_vision':'false',**options})
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
        self.assertNotIn('text',p['recognition'])
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
        result=self.client.post('/api/projects',files={'product_image':('a.jpg',raw.getvalue(),'image/jpeg')},data={'remove_product_background':'false','use_vision':'false'})
        self.assertEqual(result.status_code,202)
        self.wait(result.json()['id'])

    def test_object_recognition_remains_image_only(self):
        with patch('product_recognition.classify_product_image_safe',return_value={'available':True,'candidates':[{'category':'Мёд','source':'image','similarity':.7}]}) as model:
            p=self.create(use_vision='true')
        self.assertEqual(model.call_count,1)
        self.assertEqual(len(model.call_args.args),1)
        self.assertEqual(p['recognition']['categories'][0]['category'],'Мёд')
        self.assertNotIn('text',p['recognition'])
        self.assertFalse(p['product']['confirmed'])

    def test_text_recognition_is_absent_from_contract(self):
        fields=self.client.get('/openapi.json').json()['components']['schemas']
        upload_schema=next(value for name,value in fields.items() if name.startswith('Body_create_project'))
        self.assertNotIn('use_ocr',upload_schema['properties'])
        self.assertIn('background_quality',upload_schema['properties'])

    def test_background_pipeline_uses_cutout_and_keeps_original(self):
        def cutout(image,**kwargs):
            im=Image.new('RGBA',image.size)
            im.paste('green',(100,100,500,700))
            return im
        old=backend.background_sessions;backend.background_sessions={}
        try:
            with patch.dict('sys.modules',{'onnxruntime':SimpleNamespace(SessionOptions=lambda:SimpleNamespace()),'rembg':SimpleNamespace(new_session=lambda *args,**kwargs:object(),remove=cutout)}):
                p=self.create(remove_product_background='true')
            a=p['assets'][0]
            self.assertNotEqual(a['url'],a['original'])
            self.assertEqual((a['width'],a['height']),(400,600))
            self.assertTrue((backend.BASE/a['original'].lstrip('/')).exists())
        finally:backend.background_sessions=old

    def test_fast_mode_and_repeated_image_use_cache(self):
        calls=[]
        def remove(image,**kwargs):
            calls.append(image.size)
            result=Image.new('RGBA',image.size);result.paste('red',(10,10,image.width-10,image.height-10));return result
        old=backend.background_sessions;backend.background_sessions={}
        # Unique original avoids cache from other tests.
        original=backend.UPLOADS/'unique.png';Image.new('RGB',(2400,1600),'orange').save(original)
        try:
            with patch.dict('sys.modules',{'onnxruntime':SimpleNamespace(SessionOptions=lambda:SimpleNamespace()),'rembg':SimpleNamespace(new_session=lambda *a,**kw:object(),remove=remove)}):
                first,method=backend.make_cutout(original,'fast')
                second,again=backend.make_cutout(original,'fast')
            self.assertEqual(method,'u2netp');self.assertEqual(again,'cache')
            self.assertEqual(calls,[(1024,683)])
            self.assertEqual(first.size,(2400,1600));self.assertEqual(second.size,first.size)
        finally:backend.background_sessions=old;original.unlink()

    def test_transparent_png_never_invokes_model(self):
        original=backend.UPLOADS/'transparent.png'
        image=Image.new('RGBA',(800,900));image.paste('green',(200,200,600,700));image.save(original)
        try:
            with patch.dict('sys.modules',{'rembg':None}):
                cutout,method=backend.make_cutout(original,'detail')
            self.assertEqual(method,'transparent')
            self.assertEqual(cutout.getchannel('A').getbbox(),(200,200,600,700))
        finally:original.unlink()

    def test_invalid_background_mode_rejected(self):
        response=self.client.post('/api/projects',files={'product_image':('photo.png',png(),'image/png')},data={'background_quality':'invalid'})
        self.assertEqual(response.status_code,422)

    def test_transparent_margin_trim_without_model(self):
        raw=BytesIO();image=Image.new('RGBA',(1000,1200));image.paste('green',(100,200,700,900));image.save(raw,format='PNG')
        response=self.client.post('/api/projects',files={'product_image':('trim.png',raw.getvalue(),'image/png')},data={'remove_product_background':'false','use_vision':'false'})
        p=self.wait(response.json()['id']);asset=p['assets'][0]
        self.assertEqual((asset['width'],asset['height']),(600,700))
        self.assertNotEqual(asset['url'],asset['original'])
        self.assertTrue((backend.BASE/asset['original'].lstrip('/')).exists())

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
