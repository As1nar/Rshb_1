"""AgroVision: local image processing, durable projects and a same-origin editor."""
from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from io import BytesIO
from pathlib import Path
from threading import Lock
from uuid import UUID, uuid4
import copy
import json
import logging
import re

import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field

BASE = Path(__file__).resolve().parent
UPLOADS, RESULTS = BASE / "uploads", BASE / "results"
for folder in (UPLOADS, RESULTS):
    folder.mkdir(exist_ok=True)
executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="images")
storage_lock = Lock()
model_lock = Lock()
log = logging.getLogger("agrovision")
background_session = None
ocr_reader = None
MAX_BYTES = 12 * 1024 * 1024
Image.MAX_IMAGE_PIXELS = 24_000_000


def project_path(project_id: str) -> Path:
    try:
        UUID(project_id)
    except ValueError:
        raise HTTPException(404, "Проект не найден")
    return RESULTS / f"{project_id}.json"


def load_project(project_id: str) -> dict:
    path = project_path(project_id)
    with storage_lock:
        if not path.exists():
            raise HTTPException(404, "Проект не найден")
        return json.loads(path.read_text(encoding="utf-8"))


def write_project(project: dict) -> None:
    path = project_path(project["id"])
    temp = path.with_suffix(".tmp")
    with storage_lock:
        temp.write_text(json.dumps(project, ensure_ascii=False, allow_nan=False), encoding="utf-8")
        temp.replace(path)


def set_job(project_id: str, **updates) -> dict:
    project = load_project(project_id)
    project["job"].update(updates)
    write_project(project)
    return project


@asynccontextmanager
async def lifespan(app):
    # A reload cannot resume an in-memory inference task. Keep its originals usable.
    for path in RESULTS.glob("*.json"):
        project = json.loads(path.read_text(encoding="utf-8"))
        if project.get("job", {}).get("status") in {"queued", "running"}:
            project["job"].update(status="interrupted", stage="Обработка прервана перезапуском сервера. Можно повторить или продолжить вручную.")
            write_project(project)
    yield


app = FastAPI(title="AgroVision API", version="2.0.0", lifespan=lifespan)


class Fact(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    value: str = Field(min_length=1, max_length=500)
    source: str = Field(default="user", pattern="^(user|ocr)$")
    confirmed: bool = False


class Product(BaseModel):
    category: str = Field(default="", max_length=150)
    name: str = Field(default="", max_length=200)
    description: str = Field(default="", max_length=3000)
    facts: list[Fact] = Field(default_factory=list, max_length=30)
    confirmed: bool = False


class ProjectUpdate(BaseModel):
    product: Product
    settings: dict = Field(default_factory=dict)
    scenes: list[dict] = Field(default_factory=list, max_length=4)


def assess(project: dict) -> dict:
    product = project.get("product", {})
    facts = product.get("facts", [])
    verified = [f for f in facts if f.get("confirmed")]
    category = product.get("category", "").casefold()
    required = ["Масса / объём", "Состав"] if any(s in category for s in ["мёд", "сыр", "чай", "кофе", "продукт"]) else ["Размер", "Материал"] if any(s in category for s in ["одеж", "обув", "сумк"]) else ["Основная характеристика"]
    # Requirements are a transparent demo profile, not marketplace certification.
    missing_fields = [label for label in required if not any(f["label"].casefold() == label.casefold() for f in verified)]
    checks = {
        "Основная фотография": bool(project.get("assets")),
        "Категория": bool(product.get("category", "").strip()),
        "Название": bool(product.get("name", "").strip()),
        "Описание": bool(product.get("description", "").strip()),
        "Подтверждённые характеристики категории": not missing_fields,
        "Ручное подтверждение": bool(product.get("confirmed")),
    }
    warnings = []
    if any(not f.get("confirmed") for f in facts):
        warnings.append("Есть неподтверждённые свойства: они не включаются в автоматическую композицию.")
    if project.get("assets"):
        asset = project["assets"][0]
        if min(asset["width"], asset["height"]) < 600:
            warnings.append("Основное фото меньше 600 px по короткой стороне: возможна потеря качества.")
    text = product.get("description", "") + " " + " ".join(f["value"] for f in facts)
    if re.search(r"лечит|гарантированн|самый лучший|100\s*%", text, re.I):
        warnings.append("Проверьте категоричные, медицинские и процентные заявления: нужны основания.")
    for scene in project.get("scenes", []):
        for node in scene.get("nodes", []):
            if node.get("type") == "text" and len(node.get("text", "")) > 160:
                warnings.append("Есть длинный текстовый блок: проверьте читаемость и переполнение в редакторе.")
    missing = [label for label, done in checks.items() if not done]
    return {"score": round(sum(checks.values()) / len(checks) * 100), "checks": checks,
            "missing": missing, "required_fields": required, "missing_fields": missing_fields,
            "warnings": list(dict.fromkeys(warnings)),
            "status": "confirmed" if not missing and not warnings else "needs_review",
            "note": "Предварительная проверка по демонстрационному профилю. Не заменяет правила площадки и проверку фактов человеком."}


@app.get("/api/health")
def health():
    return {"status": "ok", "version": app.version}


@app.post("/api/projects", status_code=202)
async def create_project(
    product_image: UploadFile = File(...),
    details: list[UploadFile] = File(default=[]),
    remove_product_background: bool = Form(True),
    remove_details_background: bool = Form(False),
    use_ocr: bool = Form(True),
    use_vision: bool = Form(True),
):
    if len(details) > 5:
        raise HTTPException(422, "Можно загрузить до 5 дополнительных фотографий")
    project_id = str(uuid4())
    folder = UPLOADS / project_id
    folder.mkdir()
    assets = []
    try:
        for i, upload in enumerate([product_image, *details]):
            raw = await upload.read(MAX_BYTES + 1)
            await upload.close()
            if len(raw) > MAX_BYTES:
                raise HTTPException(413, "Каждое изображение должно быть не больше 12 МБ")
            try:
                with Image.open(BytesIO(raw)) as opened:
                    if opened.format not in {"JPEG", "PNG", "WEBP"}:
                        raise ValueError("format")
                    image = ImageOps.exif_transpose(opened).convert("RGBA")
                    if image.width * image.height > 24_000_000:
                        raise ValueError("pixels")
                    path = folder / f"original_{i}.png"
                    image.save(path)
                    assets.append({"id": f"image_{i}", "role": "product" if i == 0 else "detail",
                                   "original": f"/uploads/{project_id}/{path.name}",
                                   "url": f"/uploads/{project_id}/{path.name}",
                                   "width": image.width, "height": image.height,
                                   "remove": remove_product_background if i == 0 else remove_details_background})
            except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
                raise HTTPException(415, "Нужно корректное JPG, PNG или WEBP до 24 мегапикселей")
    except Exception:
        import shutil
        shutil.rmtree(folder, ignore_errors=True)
        raise
    project = {"id": project_id, "version": 2, "assets": assets,
               "options": {"ocr": use_ocr, "vision": use_vision},
               "job": {"status": "queued", "stage": "В очереди", "completed": 0, "total": sum(a["remove"] for a in assets) + int(use_ocr) + int(use_vision), "warnings": []},
               "recognition": {"text": [], "categories": []},
               "product": Product().model_dump(), "settings": {}, "scenes": []}
    write_project(project)
    executor.submit(process_project, project_id)
    return project


def process_project(project_id: str):
    global background_session, ocr_reader
    project = set_job(project_id, status="running", stage="Подготовка изображений")
    warnings, completed = [], 0
    try:
        for asset in project["assets"]:
            if not asset["remove"]:
                continue
            set_job(project_id, stage="Удаляем фон: " + ("товар" if asset["role"] == "product" else "деталь"))
            try:
                from rembg import new_session, remove
                with model_lock:
                    if background_session is None:
                        background_session = new_session("birefnet-general")
                    with Image.open(BASE / asset["original"].lstrip("/")) as source:
                        cutout = remove(source.convert("RGBA"), session=background_session).convert("RGBA")
                bounds = cutout.getchannel("A").point(lambda v: 255 if v > 8 else 0).getbbox()
                if not bounds:
                    raise ValueError("На фото не найден непрозрачный объект")
                cutout = cutout.crop(bounds)
                output = UPLOADS / project_id / f"{asset['id']}_cutout.png"
                cutout.save(output)
                asset.update(url=f"/uploads/{project_id}/{output.name}", width=cutout.width, height=cutout.height)
            except Exception as error:
                log.exception("Background removal failed")
                warnings.append(f"Фон не удалён ({type(error).__name__}). Используется оригинал. Проверьте requirements-background.txt и доступ к модели.")
            completed += 1
            project["job"].update(completed=completed, warnings=warnings)
            write_project(project)
        text, categories = [], []
        if project["options"]["ocr"]:
            set_job(project_id, stage="Читаем этикетки на исходных фотографиях")
            try:
                import easyocr
                with model_lock:
                    if ocr_reader is None:
                        ocr_reader = easyocr.Reader(["ru", "en"], gpu=False)
                    for asset in project["assets"]:
                        with Image.open(BASE / asset["original"].lstrip("/")) as source:
                            rgb = Image.new("RGB", source.size, "white")
                            rgb.paste(source.convert("RGB"), mask=source.convert("RGBA").getchannel("A"))
                            rgb.thumbnail((2200, 2200))
                            rows = ocr_reader.readtext(np.asarray(rgb), detail=1, paragraph=False)
                        for box, value, confidence in rows:
                            if value.strip():
                                text.append({"text": value.strip(), "confidence": round(float(confidence), 3), "asset_id": asset["id"],
                                             "box": [[float(x), float(y)] for x, y in box], "coordinate_space": list(rgb.size)})
            except Exception as error:
                log.exception("OCR failed")
                warnings.append(f"OCR недоступен ({type(error).__name__}). Установите requirements-ocr.txt, проверьте загрузку моделей или введите сведения вручную.")
            completed += 1
        lines = [row["text"] for row in text]
        if project["options"]["vision"]:
            set_job(project_id, stage="Предлагаем категории", completed=completed, warnings=warnings)
            from product_recognition import classify_product_image_safe
            result = classify_product_image_safe(BASE / project["assets"][0]["original"].lstrip("/"), lines)
            categories = result.get("candidates", [])
            if not result["available"]:
                warnings.append(result["message"])
            completed += 1
        from product_recognition import OCR_HINTS, normalize_text
        normalized = normalize_text(" ".join(lines))
        for category, terms in OCR_HINTS.items():
            matches = [term for term in terms if re.search(r"(?<!\w)" + re.escape(normalize_text(term)) + r"(?!\w)", normalized)]
            if matches and not any(c["category"] == category for c in categories):
                categories.insert(0, {"category": category, "source": "ocr", "ocr_matches": matches})
        project["recognition"] = {"text": text, "categories": categories[:5], "note": "Рейтинг CLIP — относительное сходство, не вероятность правильного ответа. Любой результат требует проверки."}
        project["job"].update(status="done", stage="Обработка завершена — проверьте сведения", completed=completed, warnings=warnings)
        write_project(project)
    except Exception as error:
        log.exception("Processing failed")
        set_job(project_id, status="failed", stage="Обработка не завершена. Можно повторить или продолжить вручную.", warnings=[*warnings, type(error).__name__])


@app.get("/api/projects/{project_id}")
def get_project(project_id: str):
    project = load_project(project_id)
    return {**project, "assessment": assess(project)}


@app.post("/api/projects/{project_id}/retry", status_code=202)
def retry(project_id: str):
    project = load_project(project_id)
    if project["job"]["status"] in {"queued", "running"}:
        raise HTTPException(409, "Обработка уже выполняется")
    project["job"].update(status="queued", completed=0, warnings=[], stage="Повторная обработка")
    write_project(project)
    executor.submit(process_project, project_id)
    return project


@app.put("/api/projects/{project_id}")
def save_project(project_id: str, payload: ProjectUpdate):
    project = load_project(project_id)
    if project["job"]["status"] in {"queued", "running"}:
        raise HTTPException(409, "Дождитесь обработки перед сохранением композиции")
    data = payload.model_dump()
    if len(json.dumps(data)) > 2_000_000:
        raise HTTPException(413, "Слишком большой проект")
    for scene in data["scenes"]:
        if not isinstance(scene.get("nodes"), list) or len(scene["nodes"]) > 100:
            raise HTTPException(422, "В сцене допустимо до 100 элементов")
    try:
        json.dumps(data, allow_nan=False)
    except ValueError:
        raise HTTPException(422, "Координаты должны быть конечными числами")
    project.update(copy.deepcopy(data))
    write_project(project)
    return {**project, "assessment": assess(project)}


@app.post("/api/projects/{project_id}/background")
async def upload_background(project_id: str, image: UploadFile = File(...)):
    load_project(project_id)
    raw = await image.read(MAX_BYTES + 1)
    await image.close()
    if len(raw) > MAX_BYTES:
        raise HTTPException(413, "Фон должен быть не больше 12 МБ")
    try:
        with Image.open(BytesIO(raw)) as source:
            if source.format not in {"JPEG", "PNG", "WEBP"} or source.width * source.height > 24_000_000:
                raise ValueError("format or size")
            path = UPLOADS / project_id / f"background_{uuid4().hex}.png"
            ImageOps.exif_transpose(source).convert("RGB").save(path)
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError):
        raise HTTPException(415, "Нужен корректный JPG, PNG или WEBP до 24 мегапикселей")
    return {"url": f"/uploads/{project_id}/{path.name}"}


app.mount("/uploads", StaticFiles(directory=UPLOADS), name="uploads")
app.mount("/", StaticFiles(directory=BASE / "frontend", html=True), name="frontend")
