#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const https = require("https");
const zlib = require("zlib");
const tar = require("tar");

const hpmGlobalDir = path.join(__dirname, "hpm_modules");
const packageDataPath = path.join(hpmGlobalDir, "hpm-packages.json");

if (!fs.existsSync(hpmGlobalDir)) {
  fs.mkdirSync(hpmGlobalDir);
}

const downloadPackage = (pkgName) => {
  const packageUrl = `https://registry.npmjs.org/${pkgName}`;

  https
    .get(packageUrl, (res) => {
      let rawData = "";
      res.on("data", (chunk) => {
        rawData += chunk;
      });
      res.on("end", () => {
        try {
          const packageInfo = JSON.parse(rawData);
          const downloadUrl =
            packageInfo.versions[packageInfo["dist-tags"].latest].dist.tarball;
          downloadTarball(downloadUrl, pkgName);
        } catch (e) {
          console.log(`Error: Failed to parse package data for ${pkgName}`);
        }
      });
    })
    .on("error", () => {
      console.log(`Error: Unable to fetch package information for ${pkgName}`);
    });
};

const downloadTarball = (url, pkgName) => {
  const filePath = path.join(hpmGlobalDir, pkgName + ".tar.gz");

  https
    .get(url, (res) => {
      if (res.statusCode !== 200) {
        console.log(`Error: Failed to download tarball for ${pkgName}`);
        return;
      }

      const fileStream = fs.createWriteStream(filePath);
      res.pipe(fileStream);

      fileStream.on("finish", () => {
        fileStream.close(() => {
          extractTarball(filePath, pkgName);
        });
      });
    })
    .on("error", () => {
      console.log(`Error: Unable to download tarball for ${pkgName}`);
    });
};

const extractTarball = (filePath, pkgName) => {
  const packageDir = path.join(hpmGlobalDir, pkgName);
  if (!fs.existsSync(packageDir)) {
    fs.mkdirSync(packageDir);
  }

  fs.createReadStream(filePath)
    .pipe(zlib.createGunzip())
    .pipe(tar.x({ C: packageDir }))
    .on("end", () => {
      fs.unlinkSync(filePath);
      saveInstalledPackage(pkgName);
      console.log(`Package ${pkgName} installed successfully.`);
    })
    .on("error", () => {
      console.log(`Error: Failed to extract tarball for ${pkgName}`);
    });
};

const saveInstalledPackage = (pkgName) => {
  let installedPackages = {};
  if (fs.existsSync(packageDataPath)) {
    installedPackages = JSON.parse(fs.readFileSync(packageDataPath, "utf8"));
  }
  installedPackages[pkgName] = true;
  fs.writeFileSync(packageDataPath, JSON.stringify(installedPackages, null, 2));
};

const listPackages = () => {
  if (!fs.existsSync(packageDataPath)) {
    console.log("No packages installed yet.");
    return;
  }

  const installedPackages = JSON.parse(
    fs.readFileSync(packageDataPath, "utf8")
  );
  console.log("Installed packages:");
  Object.keys(installedPackages).forEach((pkg) => {
    console.log(pkg);
  });
};

const linkGlobalModules = () => {
  const nodeModulesPath = path.join(process.cwd(), "node_modules");
  if (!fs.existsSync(nodeModulesPath)) {
    fs.mkdirSync(nodeModulesPath);
  }

  const installedPackages = JSON.parse(
    fs.readFileSync(packageDataPath, "utf8")
  );
  for (const pkgName of Object.keys(installedPackages)) {
    const src = path.join(hpmGlobalDir, pkgName);
    const dest = path.join(nodeModulesPath, pkgName);
    if (!fs.existsSync(dest)) {
      fs.symlinkSync(src, dest, "junction");
    }
  }
};

const showPackageInfo = (pkgName) => {
  const packagePath = path.join(hpmGlobalDir, pkgName);

  if (!fs.existsSync(packagePath)) {
    console.log(`Package ${pkgName} not found.`);
    return;
  }

  console.log(`Package ${pkgName} is installed.`);
};

const command = process.argv[2];
const pkgName = process.argv[3];

switch (command) {
  case "install":
    if (pkgName) {
      downloadPackage(pkgName);
    } else {
      console.log("Please provide a package name.");
    }
    break;
  case "list":
    listPackages();
    break;
  case "link":
    linkGlobalModules();
    break;
  case "info":
    if (pkgName) {
      showPackageInfo(pkgName);
    } else {
      console.log("Please provide a package name.");
    }
    break;
  default:
    console.log('Unknown command. Use "install", "list", "link", or "info".');
}
