const fs = require("node:fs");
const path = require("node:path");
const { XMLParser } = require("fast-xml-parser");
const { unzipSync } = require("fflate");

const projectRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(projectRoot, "AYOR_Locations_Template_v3_Mahe_Core_v1.xlsx");
const outputPath = path.join(projectRoot, "public", "data", "locations.json");
const sheetName = "Mahé Locations v1";

const fields = [
  "id",
  "name",
  "island",
  "category",
  "priority",
  "area",
  "lat",
  "lng",
  "short_description",
  "ayor_note",
  "show_for_keywords",
  "photo",
  "verified_by_me",
  "map_icon",
  "google_maps_url"
];

function asText(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function asCoordinate(value, field, rowNumber) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`Invalid ${field} at Excel row ${rowNumber}: ${value}`);
  }
  return number;
}

function toArray(value) {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function textValue(node) {
  if (node === null || node === undefined) return "";
  if (typeof node !== "object") return String(node);
  if (node["#text"] !== undefined) return String(node["#text"]);
  if (node.t !== undefined) return textValue(node.t);
  if (node.r !== undefined) return toArray(node.r).map(run => textValue(run.t)).join("");
  return "";
}

function columnIndex(reference) {
  const letters = String(reference || "").match(/^[A-Z]+/i)?.[0] || "";
  return [...letters.toUpperCase()].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function readWorkbookRows(filePath, requestedSheetName) {
  const archive = unzipSync(new Uint8Array(fs.readFileSync(filePath)));
  const decode = file => {
    if (!archive[file]) throw new Error(`Missing XLSX part: ${file}`);
    return new TextDecoder("utf-8").decode(archive[file]);
  };
  const parser = new XMLParser({
    removeNSPrefix: true,
    ignoreAttributes: false,
    attributeNamePrefix: "",
    textNodeName: "#text",
    parseTagValue: false,
    trimValues: false
  });

  const workbook = parser.parse(decode("xl/workbook.xml")).workbook;
  const relationships = parser.parse(decode("xl/_rels/workbook.xml.rels")).Relationships;
  const relationshipById = new Map(
    toArray(relationships.Relationship).map(relationship => [relationship.Id, relationship.Target])
  );
  const sheets = toArray(workbook.sheets?.sheet);
  const selected = sheets.find(sheet => sheet.name === requestedSheetName) || sheets[0];
  if (!selected) throw new Error("The workbook does not contain any worksheets.");
  const target = relationshipById.get(selected.id || selected["r:id"]);
  if (!target) throw new Error(`Cannot resolve worksheet: ${selected.name}`);
  const sheetPath = target.startsWith("/")
    ? target.replace(/^\/+/, "")
    : path.posix.normalize(path.posix.join("xl", target));

  let sharedStrings = [];
  if (archive["xl/sharedStrings.xml"]) {
    const shared = parser.parse(decode("xl/sharedStrings.xml")).sst;
    sharedStrings = toArray(shared.si).map(textValue);
  }

  const worksheet = parser.parse(decode(sheetPath)).worksheet;
  return toArray(worksheet.sheetData?.row).map(row => {
    const values = [];
    for (const cell of toArray(row.c)) {
      const index = columnIndex(cell.r);
      if (index < 0) continue;
      let value = "";
      if (cell.t === "s") value = sharedStrings[Number(textValue(cell.v))] || "";
      else if (cell.t === "inlineStr") value = textValue(cell.is);
      else if (cell.t === "b") value = textValue(cell.v) === "1";
      else value = textValue(cell.v);
      values[index] = value;
    }
    return values;
  });
}

async function convertLocations() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Excel source not found: ${sourcePath}`);
  }

  const rows = readWorkbookRows(sourcePath, sheetName);
  if (!rows.length) throw new Error("The workbook does not contain a readable locations sheet.");
  const headers = Object.fromEntries(rows[0].map((value, index) => [asText(value), index]));

  const locations = [];
  rows.slice(1).forEach((excelRow, index) => {
    const rowNumber = index + 2;
    const row = Object.fromEntries(
      fields.map(field => [field, Number.isInteger(headers[field]) ? excelRow[headers[field]] : ""])
    );
    if (!fields.some(field => asText(row[field]))) return;

      const location = {};
      for (const field of fields) {
        location[field] = field === "lat" || field === "lng"
          ? asCoordinate(row[field], field, rowNumber)
          : asText(row[field]);
      }
      if (!location.id || !location.name) {
        throw new Error(`Missing id or name at Excel row ${rowNumber}`);
      }
      locations.push(location);
  });

  const duplicateIds = locations
    .map(location => location.id)
    .filter((id, index, ids) => ids.indexOf(id) !== index);
  if (duplicateIds.length) {
    throw new Error(`Duplicate location IDs: ${[...new Set(duplicateIds)].join(", ")}`);
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(locations, null, 2)}\n`, "utf8");
  console.log(`Generated ${locations.length} locations: ${outputPath}`);
}

try {
  convertLocations().catch(error => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  });
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
