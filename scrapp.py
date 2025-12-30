import csv
import time
import re
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

START_URL = "https://warmashop.com/795-speedpaint-20"
BASE = "https://warmashop.com"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; speedpaint-scraper/1.0)"
}

def get_soup(session, url):
    r = session.get(url, timeout=30)
    r.raise_for_status()
    return BeautifulSoup(r.text, "lxml")

def find_next_page(soup):
    # PrestaShop: souvent <a rel="next"> ou pagination-next
    a = soup.select_one("a[rel='next'], li.pagination-next a, a.next")
    if a and a.get("href"):
        return a["href"]
    link = soup.find("link", rel="next")
    if link and link.get("href"):
        return link["href"]
    return None

def extract_product_links(soup, page_url):
    links = set()

    # sélecteurs presta fréquents pour les liens produits
    for a in soup.select("article.product-miniature a.thumbnail, .product-thumbnail a, a.product-thumbnail"):
        href = a.get("href")
        if href:
            links.add(urljoin(page_url, href))

    # fallback : chercher dans tous les <a>
    if not links:
        for a in soup.find_all("a", href=True):
            if "/speedpaint" in a["href"]:
                links.add(urljoin(page_url, a["href"]))

    return links

def extract_main_image_url(product_soup, product_url):
    """
    Cherche l'image principale.
    On veut une url du style:
    https://warmashop.com/20862-home_default/speedpaint-20-gravelord-grey-speedpaint-20.jpg
    """
    candidates = set()

    for img in product_soup.find_all("img"):
        for attr in ["src", "data-src", "data-original", "srcset"]:
            v = img.get(attr)
            if not v:
                continue
            if attr == "srcset":
                parts = [p.strip().split(" ")[0] for p in v.split(",") if p.strip()]
                for p in parts:
                    candidates.add(urljoin(product_url, p))
            else:
                candidates.add(urljoin(product_url, v))

    # garder uniquement les home_default
    home_default = [u for u in candidates if "home_default" in u and u.endswith(".jpg")]
    if home_default:
        # en général la plus "propre"
        return sorted(home_default)[0]

    # fallback : tout jpg
    jpgs = [u for u in candidates if u.endswith(".jpg")]
    return sorted(jpgs)[0] if jpgs else None


def scrape():
    session = requests.Session()
    session.headers.update(HEADERS)

    category_url = START_URL
    product_links = set()
    visited_pages = set()

    # 1) Parcours pagination catégorie → récupération liens produits
    while category_url and category_url not in visited_pages:
        visited_pages.add(category_url)
        print("CATEGORY:", category_url)

        soup = get_soup(session, category_url)
        product_links |= extract_product_links(soup, category_url)

        nxt = find_next_page(soup)
        category_url = urljoin(category_url, nxt) if nxt else None
        time.sleep(0.4)

    print(f"✅ {len(product_links)} liens produits trouvés")

    # 2) Sur chaque produit → extraire image principale
    results = []
    for i, url in enumerate(sorted(product_links), 1):
        print(f"[{i}/{len(product_links)}] PRODUCT:", url)
        soup = get_soup(session, url)
        img_url = extract_main_image_url(soup, url)
        results.append((url, img_url))
        time.sleep(0.3)

    return results


if __name__ == "__main__":
    results = scrape()

    out_csv = "warmashop_speedpaint2_product_images.csv"
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["product_url", "image_url"])
        for product_url, image_url in results:
            w.writerow([product_url, image_url])

    print(f"\n📄 Export terminé: {out_csv}")
