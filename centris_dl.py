from pathlib import Path
import json
import re
from typing import Any, Callable
import yarl

import time
import mimetypes
import shutil
from selenium import webdriver
from selenium.webdriver.chrome.service import Service as ChromeService
from selenium.webdriver.common.by import By
from selenium.webdriver.support.wait import WebDriverWait
from selenium.webdriver.common.action_chains import ActionChains
import httpx
import click
from webdriver_manager.chrome import ChromeDriverManager

def retry(predicate: Callable[[], Any], err_msg: str) -> Any:
    start = time.time()
    while (time.time() - start) < 2.0:
        ret = predicate()
        if ret:
            return ret
        time.sleep(0.1)
    raise AssertionError(err_msg)


def underline(header: str) -> str:
    return header + "\n" + "="*len(header) + "\n"

@click.command()
@click.argument("url")
@click.argument("name", default="test")
def cli(url: str, name: str) -> None:
    output_dir = Path.cwd() / "output" / name
    if output_dir.is_dir():
        keep_going = click.confirm(f"Directory '{output_dir}' already exists. Do you want to clear it?", default=True)
        if not keep_going:
            return
        shutil.rmtree(output_dir)
    output_dir.mkdir()
    driver = webdriver.Chrome(service=ChromeService(ChromeDriverManager().install()))
    driver.get(url)

    house_info = driver.find_element(by=By.CSS_SELECTOR, value=".house-info").text
    features = driver.find_element(by=By.CSS_SELECTOR, value=".description").text
    description = driver.find_element(by=By.CSS_SELECTOR, value=".property-description").text
    with open(output_dir / "listing.txt", "w") as f:
        f.write(underline("Info"))
        f.write(house_info)
        f.write("\n")
        f.write(underline("Features"))
        f.write(features)
        f.write("\n")
        f.write(underline("Description"))
        f.write(description)

    privacy_notice_agree = driver.find_element(by=By.CSS_SELECTOR, value="#didomi-notice-agree-button")
    if privacy_notice_agree:
        privacy_notice_agree.click()

    WebDriverWait(driver, 10).until_not(lambda d: d.find_element(by=By.CSS_SELECTOR, value="[data-testid=\"notice\"]"))

    e_container = driver.find_element(by=By.CSS_SELECTOR, value=".primary-photo-container a")
    e_container.click()

    WebDriverWait(driver, 10).until(lambda d: d.find_element(by=By.CSS_SELECTOR, value=".carousel img"))

    photo_urls_script = driver.find_element(by=By.CSS_SELECTOR, value=".thumbnail").find_element(by=By.CSS_SELECTOR, value="script").get_attribute("innerHTML").strip()
    arr_string = photo_urls_script.split("=", 1)[1].rstrip(";")
    urls = json.loads(arr_string)
    e_carousel = driver.find_element(by=By.CSS_SELECTOR, value=".carousel")
    print(e_carousel.get_attribute("innerHTML"))
    with httpx.Client() as client:
        e_images = retry(lambda: e_carousel.find_elements(by=By.CSS_SELECTOR, value="img"), "Could not get images")
        num_images = len(urls)
        max_index_length = len(str(num_images))
        ui = -1
        for ei, e_image in enumerate(e_images):
            print()
            title = e_image.get_attribute("title")
            print(ei + 1, title)
            if "virtual" in e_image.get_attribute("class"):
                print("virtual, skipping")
                continue
            ui += 1
            image_number = ui + 1
            src_thumb_raw = urls[ui]
            src_thumb = yarl.URL(src_thumb_raw)
            query_params = {**dict(src_thumb.query), **{"sm": "m", "w": 1260, "h": 1024}}
            src_full = src_thumb.with_query(query_params)
            print(src_thumb, src_full)
            r = client.get(str(src_full))
            r.raise_for_status()
            content_type = r.headers["content-type"]
            ext = mimetypes.guess_extension(content_type)
            clean_title = re.sub(r'[\\/:"*?<>|]+', "", title)
            base_filename = f"{image_number:0{max_index_length}d}-{clean_title}"
            dst = (output_dir / base_filename).with_suffix(ext)
            print("->", dst)
            dst.write_bytes(r.content)

    print(f"Zipping: {output_dir}")
    archive = shutil.make_archive(name, "zip", root_dir=output_dir)
    archive_dst = shutil.move(archive, output_dir)
    print(f"Zipfile is at: {archive_dst}")


if __name__ == "__main__":
    cli()