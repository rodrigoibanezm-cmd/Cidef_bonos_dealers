const SOURCE_TYPE_PATTERNS = [
  ["INSCRIPCION", /(?:^|\s|[_-])(INS|INSCRIP|INSCRIPCION)(?:\s|[_-]|\.|$)/i],
  ["FINANCIAMIENTO", /(?:^|\s|[_-])(CARTA|FIN|FINANCIAMIENTO)(?:\s|[_-]|\.|$)/i],
  ["REPOSICION", /(?:^|\s|[_-])(REPO|REPOSICION)(?:\s|[_-]|\.|$)/i],
  ["FC", /(?:^|\s|[_-])FC(?:\s|[_-]|\.|$)/i],
  ["FV", /(?:^|\s|[_-])FV(?:\s|[_-]|\.|$)/i],
];

export function documentTypeHintFromSourceFilename(sourceFilename) {
  const name = String(sourceFilename || "");
  for (const [type, pattern] of SOURCE_TYPE_PATTERNS) {
    if (pattern.test(name)) return type;
  }
  return null;
}

export function guardDocumentRouting({ sourceFilename, classifiedType }) {
  const sourceHint = documentTypeHintFromSourceFilename(sourceFilename);
  if (!sourceHint || classifiedType === "BASURA" || classifiedType === sourceHint) {
    return { allowed: true, sourceHint, reason: null };
  }

  // FC and REPOSICION share the same invoice layout. Their final routing is
  // resolved later by comparing the document Chassis with the operation VIN.
  if (["FC", "REPOSICION"].includes(sourceHint) && ["FC", "REPOSICION"].includes(classifiedType)) {
    return { allowed: true, sourceHint, reason: "FC_REPO_REQUIRES_CHASSIS_RESOLUTION" };
  }

  return {
    allowed: false,
    sourceHint,
    reason: `SOURCE_HINT_${sourceHint}_CONFLICTS_WITH_${classifiedType}`,
  };
}
