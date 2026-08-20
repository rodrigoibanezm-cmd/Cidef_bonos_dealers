function norm(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

function compact(value) {
  return norm(value).replace(/\s+/g, "");
}

function has(desc, token) {
  return token && compact(desc).includes(compact(token));
}

export function scorePriceVersion(inventory, candidate) {
  const desc = norm(inventory?.desc_abrev);
  let score = 0;
  const reasons = [];

  const modeloTokens = norm(candidate?.modelo).split(/\s+/).filter(Boolean);
  for (const token of modeloTokens) {
    if (token.length < 2) continue;
    if (has(desc, token)) {
      score += 3;
      reasons.push(`modelo:${token}`);
    }
  }

  if (candidate?.traccion && has(desc, candidate.traccion)) {
    score += 10;
    reasons.push(`traccion:${candidate.traccion}`);
  }

  const trans = compact(candidate?.transmision);
  if (trans) {
    const manual = /MT|MANUAL/.test(trans);
    const auto = /AT|AUTO|AUTOMAT/.test(trans);
    if (manual && /MT|MANUAL/.test(compact(desc))) {
      score += 8;
      reasons.push(`transmision:${candidate.transmision}`);
    } else if (auto && /AT|AUTO|AUTOMAT/.test(compact(desc))) {
      score += 8;
      reasons.push(`transmision:${candidate.transmision}`);
    }
  }

  if (candidate?.combustible && norm(candidate.combustible) === norm(inventory?.tipo_motor)) {
    score += 4;
    reasons.push(`combustible:${candidate.combustible}`);
  }

  if (candidate?.cc && has(desc, candidate.cc)) {
    score += 4;
    reasons.push(`cc:${candidate.cc}`);
  }

  const euro = norm(candidate?.euro).replace(/^EURO\s*/, "");
  if (euro && norm(inventory?.norma).includes(euro)) {
    score += 3;
    reasons.push(`euro:${candidate.euro}`);
  }

  const versionTokens = norm(candidate?.version).split(/\s+/).filter((t) => t.length >= 3);
  for (const token of versionTokens) {
    if (has(desc, token)) {
      score += 1;
      reasons.push(`version:${token}`);
    }
  }

  return { score, reasons };
}

export function rankPriceVersions(inventory, candidates) {
  return candidates
    .map((row) => ({ row, ...scorePriceVersion(inventory, row) }))
    .sort((a, b) => b.score - a.score || Number(a.row.price_version_id) - Number(b.row.price_version_id));
}
