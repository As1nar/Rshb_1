"""Локальное zero-shot распознавание товара по изображению с помощью CLIP."""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageOps

MODEL_NAME = "openai/clip-vit-base-patch32"

PRODUCT_LABELS = [
    ("Чай", "a box or package of tea, tea bags or loose leaf tea"),
    ("Кофе", "a bag or jar of coffee beans or ground coffee"),
    ("Мёд", "a jar of honey"),
    ("Сыр", "a block or package of cheese"),
    ("Молоко и молочные продукты", "a carton or bottle of milk or dairy product"),
    ("Шоколад и конфеты", "a chocolate bar or box of candies"),
    ("Печенье и выпечка", "a package of cookies biscuits or bakery product"),
    ("Сок и напитки", "a bottle or carton of juice or soft drink"),
    ("Вода", "a bottle of drinking water"),
    ("Специи и приправы", "a jar or packet of spices or seasoning"),
    ("Масло", "a bottle of cooking oil or olive oil"),
    ("Соус", "a bottle or jar of sauce ketchup or mayonnaise"),
    ("Крупы и макароны", "a bag or box of rice pasta grains or cereal"),
    ("Хлеб", "a loaf or package of bread"),
    ("Мясные продукты", "a package of sausage ham or processed meat"),
    ("Замороженные продукты", "a package of frozen food"),
    ("Консервы", "a tin can or jar of canned food"),
    ("Фрукты и овощи", "fresh fruits or vegetables"),
    ("Корм для животных", "a bag or can of pet food"),
    ("Косметика для лица", "a cosmetic face cream serum or facial skincare bottle"),
    ("Шампунь и уход за волосами", "a shampoo or hair care bottle"),
    ("Мыло и гигиена", "a bar of soap or personal hygiene product"),
    ("Парфюмерия", "a perfume or fragrance bottle"),
    ("Бытовая химия", "a bottle of household cleaning detergent"),
    ("Свечи и аромат для дома", "a scented candle or home fragrance product"),
    ("Посуда и товары для кухни", "kitchenware or a kitchen utensil"),
    ("Текстиль для дома", "a towel blanket or home textile product"),
    ("Декор для дома", "a home decoration or decorative object"),
    ("Освещение", "a lamp or lighting fixture"),
    ("Мебель", "a piece of furniture"),
    ("Одежда", "a piece of clothing displayed as a product"),
    ("Обувь", "a pair of shoes or sneakers"),
    ("Сумки и аксессуары", "a handbag backpack or fashion accessory"),
    ("Ювелирные изделия", "jewelry such as a necklace ring or earrings"),
    ("Часы", "a wristwatch"),
    ("Смартфоны и электроника", "a smartphone or electronic device"),
    ("Компьютерные аксессуары", "a keyboard mouse or computer accessory"),
    ("Наушники и аудио", "headphones or a speaker"),
    ("Кабели и зарядные устройства", "a charging cable or power adapter"),
    ("Игрушки", "a toy or children's play item"),
    ("Канцелярия", "stationery such as a notebook pen or pencil"),
    ("Книги", "a book"),
    ("Спорт и фитнес", "sports or fitness equipment"),
    ("Туризм и отдых", "camping or outdoor equipment"),
    ("Инструменты", "a hand tool or hardware product"),
    ("Автотовары", "a car accessory or automotive product"),
    ("Сад и растения", "a potted plant or gardening product"),
    ("Товары для ванной", "a bathroom accessory"),
    ("Медицинские и аптечные товары", "a non-prescription healthcare product package"),
    ("Спортивное питание", "a sports nutrition powder tub or protein supplement package"),
    ("Товары для животных", "a pet accessory such as a leash bowl or toy"),
    ("Упаковка или коробка", "a generic retail product package or cardboard box"),
    ("Стеклянная бутылка", "a glass bottle product"),
    ("Пластиковая бутылка", "a plastic bottle product"),
    ("Банка с продуктом", "a retail jar with a product inside"),
    ("Пакетированный товар", "a sealed retail pouch or bag product"),
    ("Другое", "a consumer product photographed on a plain background"),
]

@lru_cache(maxsize=1)
def _load_model():
    import torch
    from transformers import CLIPModel, CLIPProcessor

    device = "cuda" if torch.cuda.is_available() else "cpu"
    processor = CLIPProcessor.from_pretrained(MODEL_NAME)
    model = CLIPModel.from_pretrained(MODEL_NAME)
    model.to(device)
    model.eval()
    return torch, processor, model, device


def classify_product_image(image_path: str | Path, top_k: int = 5) -> dict:
    """Rank product categories from the image only, fully locally."""
    torch, processor, model, device = _load_model()
    with Image.open(image_path) as source:
        image = ImageOps.exif_transpose(source).convert("RGBA")
        white = Image.new("RGBA", image.size, "white")
        white.alpha_composite(image)
        image = white.convert("RGB")

    prompts = [f"A clear product photo of {description}." for _, description in PRODUCT_LABELS]
    inputs = processor(text=prompts, images=image, return_tensors="pt", padding=True, truncation=True)
    inputs = {key: value.to(device) for key, value in inputs.items()}
    with torch.inference_mode():
        outputs = model(**inputs)
        similarities = outputs.logits_per_image[0].float().cpu().tolist()

    probabilities = torch.softmax(torch.tensor(similarities, dtype=torch.float32), dim=0).tolist()
    scored = []
    for (category, description), raw_similarity, probability in zip(PRODUCT_LABELS, similarities, probabilities):
        score = float(probability)
        scored.append({
            "category": category,
            "description": description,
            "similarity": round(float(probability), 4),
            "raw_similarity": round(float(raw_similarity), 4),
            "combined_score": round(score, 4),
            "source": "image",
        })
    scored.sort(key=lambda item: item["combined_score"], reverse=True)
    candidates = scored[:max(1, min(top_k, 10))]
    margin = candidates[0]["combined_score"] - candidates[1]["combined_score"] if len(candidates) > 1 else 0
    return {
        "available": True,
        "model": MODEL_NAME,
        "device": device,
        "method": "local zero-shot image classification",
        "top_category": candidates[0]["category"],
        "candidates": candidates,
        "needs_confirmation": True,
        "note": "Проценты отражают относительное ранжирование среди категорий в этом запуске, а не калиброванную вероятность. Выберите правильный вариант вручную.",
        "top_margin": round(margin, 4),
    }


def classify_product_image_safe(image_path: str | Path, top_k: int = 5) -> dict:
    try:
        return classify_product_image(image_path, top_k=top_k)
    except ImportError as error:
        return {
            "available": False,
            "candidates": [],
            "message": "Модуль визуального распознавания не установлен. Выполните: python -m pip install -r requirements-vision.txt",
            "error": str(error),
        }
    except Exception as error:
        return {
            "available": False,
            "candidates": [],
            "message": f"Визуальное распознавание не выполнено ({type(error).__name__}). Можно выбрать категорию вручную.",
        }
