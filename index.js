const { Builder, By, until } = require("selenium-webdriver");
const chrome = require("selenium-webdriver/chrome");
const fs = require("fs");
const path = require("path");
const mime = require("mime-types");
const { URL } = require("url");

async function cli(url) {
  const driver = await new Builder()
    .forBrowser("chrome")
    .setChromeOptions(new chrome.Options())
    .build();
  try {
    await driver.get(url);

    const dirName = await driver
      .findElement(By.css(".house-info h2"))
      .getText();
    const outputDir = path.join(process.cwd(), "output", dirName);

    if (fs.existsSync(outputDir)) {
      fs.rmdirSync(outputDir, { recursive: true });
    }
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

    const eContainer = await driver.findElement(
      By.css(".primary-photo-container a")
    );
    await eContainer.click();

    await driver.wait(until.elementLocated(By.css(".carousel img")), 10000);

    const photoUrlsScript = await driver
      .findElement(By.css(".thumbnail script"))
      .getAttribute("innerHTML");
    const arrString = /(\[.+\])/.exec(photoUrlsScript)[1];
    const urls = JSON.parse(arrString);

    const images = await driver.findElements(By.css(".carousel img"));
    const numImages = urls.length;
    const maxIndexLength = String(numImages).length;

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

      let contentType;
      const response = await fetch(srcFull).then((res) => {
        contentType = res.headers.get("content-type");
        return res.arrayBuffer();
      });
      const ext = mime.extension(contentType);
      const cleanTitle = title.replace(/[\\/:"*?<>|]+/g, "");
      const baseFilename = `${i}-${cleanTitle}`;
      const dst = path.join(outputDir, `${baseFilename}.${ext}`);

      fs.writeFileSync(dst, Buffer.from(response));
    });

    await Promise.all(promises);
  } finally {
    await driver.quit();
  }
}

cli(process.argv[2]);