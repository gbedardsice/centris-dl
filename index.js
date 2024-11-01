#!/usr/bin/env node

import { Builder, By, until } from "selenium-webdriver";
import chrome from "selenium-webdriver/chrome.js";
import fs from "fs-extra";
import * as path from "path";
import * as mime from "mime-types";
import { URL } from "url";
import { execSync } from "child_process";

async function extractInformation(url) {
  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(new chrome.Options())
    .build();

  try {
    await driver.get(url);

    const listingName = await driver
      .findElement(By.css(".house-info h2"))
      .getText();
    const outputDir = path.join(process.cwd(), "tmp", listingName);

    fs.removeSync(outputDir);
    fs.mkdirSync(outputDir, { recursive: true });

    const houseInfo = await driver.findElement(By.css(".house-info")).getText();
    const features = await driver.findElement(By.css(".description")).getText();
    const description = await driver
      .findElement(By.css(".property-description"))
      .getText();

    fs.writeFileSync(
      path.join(outputDir, "listing.md"),
      `## Info\n\n${houseInfo}\n\n## Features\n\n${features}\n\n## Description\n\n${description}`
    );

    const privacyNoticeAgree = await driver.findElement(
      By.css("#didomi-notice-agree-button")
    );

    if (privacyNoticeAgree) {
      await privacyNoticeAgree.click();
    }

    await driver.wait(async () => {
      const elements = await driver.findElements(
        By.css('[data-testid="notice"]')
      );
      return elements.length === 0;
    }, 10000);

    const galleryTrigger = await driver.findElement(
      By.css(".primary-photo-container a")
    );
    await galleryTrigger.click();

    await driver.wait(until.elementLocated(By.css(".carousel img")), 10000);

    const photoUrlsScript = await driver
      .findElement(By.css(".thumbnail script"))
      .getAttribute("innerHTML");
    const arrString = /(\[.+\])/.exec(photoUrlsScript)[1];
    const urls = JSON.parse(arrString);

    const images = await driver.findElements(By.css(".carousel img"));

    const promises = images.map(async (image, i) => {
      const title = await image.getAttribute("title");
      const className = await image.getAttribute("class");
      if (className.includes("virtual")) {
        return;
      }
      const srcThumbRaw = urls[i];
      const srcThumb = new URL(srcThumbRaw);
      srcThumb.searchParams.set("sm", "m");
      srcThumb.searchParams.set("w", "1260");
      srcThumb.searchParams.set("h", "1024");
      const srcFull = srcThumb.toString();
      const response = await fetch(srcFull);
      const contentType = response.headers.get("content-type");
      const buffer = await response.arrayBuffer();
      const ext = mime.extension(contentType);
      const cleanTitle = title.replace(/[\\/:"*?<>|]+/g, "");
      const baseFilename = `${i}-${cleanTitle}`;
      const dst = path.join(outputDir, `${baseFilename}.${ext}`);

      fs.writeFileSync(dst, Buffer.from(buffer));
    });

    await Promise.all(promises);
    console.log(outputDir);
    const archive = execSync(`zip -r -j "${listingName}.zip" "${outputDir}"`);
    fs.removeSync(outputDir);
  } finally {
    await driver.quit();
  }
}

extractInformation(process.argv[2]);
