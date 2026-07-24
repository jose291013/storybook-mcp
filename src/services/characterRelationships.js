function key(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function familyRelationshipKind(value) {
  const normalized = key(value);
  if (/(^| )(mother|mom|mum|maman|mere|mama|madre)( |$)/u.test(normalized)) return "mother";
  if (/(^| )(father|dad|papa|pere|padre)( |$)/u.test(normalized)) return "father";
  return "";
}

export function preferredFamilyAddress(character = {}, language = "FR") {
  const kind = familyRelationshipKind(character.relationship);
  if (!kind) return "";
  const locale = String(language || "FR").trim().toUpperCase();
  if (locale === "ES") return kind === "mother" ? "Mamá" : "Papá";
  if (locale === "EN") return kind === "mother" ? "Mum" : "Dad";
  return kind === "mother" ? "Maman" : "Papa";
}

export function enrichFamilyAddress(character = {}, language = "FR") {
  const preferredAddress = preferredFamilyAddress(character, language);
  return preferredAddress ? { ...character, preferredAddress } : { ...character };
}
