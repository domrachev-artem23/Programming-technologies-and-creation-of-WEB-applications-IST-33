#!/usr/bin/env python3
# Скачивает фотографии FoodExpress в папку img рядом с этим файлом.
from pathlib import Path
from urllib.request import Request, urlopen

BASE = Path(__file__).resolve().parent
IMG = BASE / "img"
IMG.mkdir(exist_ok=True)

FILES = {
    "hero-food.jpg": "https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=2070&auto=format&fit=crop",
    "restaurant-pizza.jpg": "https://images.unsplash.com/photo-1513104890138-7c749659a591?q=80&w=600&auto=format&fit=crop",
    "restaurant-sushi.jpg": "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?q=80&w=600&auto=format&fit=crop",
    "restaurant-burger.jpg": "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=600&auto=format&fit=crop",
    "restaurant-salad.jpg": "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?q=80&w=600&auto=format&fit=crop",
    "dish-pepperoni.jpg": "https://images.unsplash.com/photo-1574071318508-1cdbab80d002?q=80&w=600&auto=format&fit=crop",
    "dish-philadelphia.jpg": "https://images.unsplash.com/photo-1611143669185-af224c5e3252?q=80&w=600&auto=format&fit=crop",
    "dish-caesar.jpg": "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=600&auto=format&fit=crop",
    "dish-burger.jpg": "https://images.unsplash.com/photo-1550547660-d9450f859349?q=80&w=600&auto=format&fit=crop",
}

for name, url in FILES.items():
    target = IMG / name
    try:
        req = Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urlopen(req, timeout=40) as response:
            data = response.read()
            if not response.headers.get("Content-Type", "").startswith("image/"):
                raise RuntimeError("Сервер вернул не изображение")
        target.write_bytes(data)
        print(f"[OK] {name} ({len(data)//1024} КБ)")
    except Exception as exc:
        print(f"[ОШИБКА] {name}: {exc}")

missing = [name for name in FILES if not (IMG / name).exists() or (IMG / name).stat().st_size < 1000]
if missing:
    print("\nНе удалось скачать: " + ", ".join(missing))
    print("Проверьте подключение к интернету и запустите скрипт ещё раз.")
else:
    print("\nГотово! Все фотографии сохранены локально в папке img.")
