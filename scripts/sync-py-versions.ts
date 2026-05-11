/**
 * After `changeset version` bumps package.json versions, this script syncs
 * the version of any package that also has a pyproject.toml into that file.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

const packagesDir = join(import.meta.dir, "..", "packages");
const packages = readdirSync(packagesDir);

let synced = 0;

for (const pkg of packages) {
	const pkgJsonPath = join(packagesDir, pkg, "package.json");
	const pyprojectPath = join(packagesDir, pkg, "pyproject.toml");

	if (!existsSync(pkgJsonPath) || !existsSync(pyprojectPath)) continue;

	const { version } = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
	const pyproject = readFileSync(pyprojectPath, "utf-8");
	const updated = pyproject.replace(
		/^version\s*=\s*"[^"]*"/m,
		`version = "${version}"`
	);

	if (updated === pyproject) {
		console.log(`  ${pkg}: pyproject.toml version already matches or no version field found`);
		continue;
	}

	writeFileSync(pyprojectPath, updated);
	console.log(`  ${pkg}: pyproject.toml -> ${version}`);
	synced++;
}

console.log(`\nSynced ${synced} pyproject.toml file(s).`);
