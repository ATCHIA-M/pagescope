const analyzeBtn = document.getElementById("analyzeBtn");
const reanalyzeBtn = document.getElementById("reanalyzeBtn");
const welcome = document.getElementById("welcome");
const loading = document.getElementById("loading");
const report = document.getElementById("report");
const errorBox = document.getElementById("error");

function show(element) {
  [welcome, loading, report, errorBox].forEach((section) => {
    section.classList.add("hidden");
  });
  element.classList.remove("hidden");
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = String(text);
  return element;
}

function restrictedPageMessage(url) {
  if (!url) return null;
  let pageUrl;
  try {
    pageUrl = new URL(url);
  } catch {
    return "PageScope could not read this tab's address. Open a normal HTTP or HTTPS website and try again.";
  }
  if (
    ["chrome:", "chrome-extension:", "edge:", "about:", "view-source:", "devtools:"]
      .includes(pageUrl.protocol)
  ) {
    return "This browser page is restricted. Open a normal HTTP or HTTPS website and try again.";
  }
  if (
    pageUrl.hostname === "chromewebstore.google.com" ||
    (pageUrl.hostname === "chrome.google.com" && pageUrl.pathname.startsWith("/webstore"))
  ) {
    return "Chrome Web Store pages are restricted. Open the website you want to analyze in a normal tab.";
  }
  if (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") {
    return "PageScope can analyze HTTP and HTTPS webpages only. Open a normal website and try again.";
  }
  return null;
}

async function getActiveTab() {
  const queries = [
    { active: true, lastFocusedWindow: true },
    { active: true, currentWindow: true },
    { active: true },
  ];
  for (const query of queries) {
    const tabs = await chrome.tabs.query(query);
    const tab = tabs.find((candidate) => Number.isInteger(candidate.id));
    if (tab) return tab;
  }
  throw new Error("Chrome did not return an active tab. Select the webpage and try again.");
}

async function analyzePage() {
  analyzeBtn.disabled = true;
  reanalyzeBtn.disabled = true;
  show(loading);
  try {
    const tab = await getActiveTab();
    const restrictedMessage = restrictedPageMessage(tab.url);
    if (restrictedMessage) throw new Error(restrictedMessage);

    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const restrictedUrl = detail.match(
        /Cannot access contents of url\s+["']?([^"'\s]+)/i,
      )?.[1];
      const message = restrictedPageMessage(restrictedUrl);
      if (message) throw new Error(message);
      throw new Error(
        `Could not access this webpage. Reload it and try again. ${detail}`,
      );
    }

    const response = await chrome.tabs.sendMessage(tab.id, {
      action: "PAGESCOPE_EXTRACT",
    });
    if (!response?.success) {
      throw new Error(response?.error || "The webpage extraction failed.");
    }
    if (!response.data?.metadata || !response.data?.statistics) {
      throw new Error("The webpage returned incomplete extraction data.");
    }

    const result = PageScopeAnalysis.analyze(response.data);
    renderReport(response.data, result);
  } catch (error) {
    show(errorBox);
    errorBox.textContent =
      "Unable to analyze this page: " +
      (error instanceof Error ? error.message : String(error));
  } finally {
    analyzeBtn.disabled = false;
    reanalyzeBtn.disabled = false;
  }
}

function sourceHref(evidence) {
  try {
    const url = new URL(evidence.url);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (evidence.id) url.hash = evidence.id;
    return url.href;
  } catch {
    return null;
  }
}

function appendEvidence(container, evidence) {
  if (!evidence?.length) return;
  const details = createElement("details", "evidence-details");
  details.appendChild(createElement("summary", "", `Source details · ${evidence.length}`));
  const content = createElement("div", "evidence-content");
  evidence.forEach((item) => {
    const entry = createElement("div", "evidence-entry");
    entry.appendChild(createElement("span", "evidence-source", item.source || "Page content"));
    entry.appendChild(createElement("p", "", item.text || ""));
    const href = sourceHref(item);
    if (href) {
      const link = createElement("a", "source-link", item.id ? "Open source section ↗" : "Open source page ↗");
      link.href = href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      entry.appendChild(link);
    }
    content.appendChild(entry);
  });
  details.appendChild(content);
  container.appendChild(details);
}

function renderFinding(finding) {
  const card = createElement("article", "content-item finding-card");
  const heading = createElement("strong", "finding-title", finding.title);
  card.appendChild(heading);
  if (finding.text) card.appendChild(createElement("p", "finding-text", finding.text));
  card.appendChild(
    createElement(
      "span",
      finding.mode === "direct" ? "finding-mode direct" : "finding-mode heuristic",
      finding.mode === "direct" ? "Extracted" : "Rule-based interpretation",
    ),
  );
  appendEvidence(card, finding.evidence);
  return card;
}

function numberTypeLabel(type) {
  const labels = {
    price: "Price",
    percentage: "Percentage",
    date: "Date",
    year: "Year",
    rating: "Rating",
    measurement: "Measurement",
    quantity: "Quantity",
    statistic: "Statistic",
  };
  return labels[type] || type;
}

function renderHeadingItem(heading, includeEvidence) {
  const level = Math.max(1, Math.min(6, Number(heading.level) || 1));
  const card = createElement("div", "content-item heading-item");
  card.style.marginInlineStart = `${(level - 1) * 9}px`;
  card.append(
    createElement("span", "heading-level", `H${level}`),
    createElement("span", "heading-text", heading.text),
  );
  if (includeEvidence) appendEvidence(card, [heading]);
  return card;
}

function renderLink(link) {
  const card = createElement("div", "content-item link-card");
  const label = link.text || link.domain || link.url || "Untitled link";
  card.appendChild(createElement("div", "link-title", label));
  const destination = createElement("a", "link-destination", link.url);
  destination.href = link.url;
  destination.target = "_blank";
  destination.rel = "noopener noreferrer";
  card.appendChild(destination);
  card.appendChild(
    createElement(
      "span",
      link.external ? "link-kind external" : "link-kind internal",
      link.external ? "External" : "Internal",
    ),
  );
  if (link.section || link.sourceUrl) {
    const source = {
      text: label,
      source: link.section || "Link on source page",
      url: link.sourceUrl || "",
      id: link.id || null,
    };
    appendEvidence(card, [source]);
  }
  return card;
}

function renderLinkGroup(container, label, links) {
  const group = createElement("div", "link-group");
  group.appendChild(createElement("h4", "", `${label} (${links.length})`));
  if (!links.length) {
    group.appendChild(createElement("p", "muted", `No ${label.toLowerCase()} detected.`));
    container.appendChild(group);
    return;
  }
  links.slice(0, 2).forEach((link) => group.appendChild(renderLink(link)));
  if (links.length > 2) {
    const disclosure = createElement("details", "disclosure");
    disclosure.appendChild(createElement("summary", "", `Show all ${links.length} links`));
    const content = createElement("div", "content-list disclosure-content");
    links.slice(2).forEach((link) => content.appendChild(renderLink(link)));
    disclosure.appendChild(content);
    group.appendChild(disclosure);
  }
  container.appendChild(group);
}

function renderReport(data, result) {
  const { metadata, statistics } = data;
  document.getElementById("pageTitle").textContent = metadata.title || "Untitled webpage";
  document.getElementById("pageDomain").textContent = metadata.url || metadata.domain || "";

  const classification = document.getElementById("classification");
  classification.replaceChildren();
  document.getElementById("classificationEvidence").replaceChildren();
  const primary = createElement("div", "classification-primary");
  primary.append(
    createElement("strong", "", result.classification.label),
    createElement("span", "confidence", `${Math.round(result.classification.confidence * 100)}% rule confidence`),
  );
  primary.appendChild(
    createElement(
      "p",
      "muted",
      result.classification.uncertain
        ? "Insufficient evidence for a specific page type. This is a rule-based estimate, not AI analysis."
        : "Weighted rule-based estimate; this score is not a calibrated probability or AI-generated verdict.",
    ),
  );
  classification.appendChild(primary);
  if (result.classification.secondary.length) {
    const secondary = createElement("div", "secondary-classifications");
    result.classification.secondary.forEach((item) => {
      const card = createElement("div", "secondary-classification");
      card.appendChild(createElement("span", "", `Also detected: ${item.label} (score ${item.score})`));
      appendEvidence(card, item.evidence);
      secondary.appendChild(card);
    });
    classification.appendChild(secondary);
  }
  appendEvidence(document.getElementById("classificationEvidence"), result.classification.evidence);

  const identity = document.getElementById("identityMetadata");
  identity.replaceChildren();
  [
    ["Website", metadata.siteName],
    ["Author", metadata.author],
    ["Published", metadata.published],
    ["Language", metadata.language],
    ["Canonical", metadata.canonical],
    ["DOI", metadata.doi],
  ].filter(([, value]) => value).forEach(([label, value]) => {
    identity.appendChild(createElement("span", "meta-chip", `${label}: ${value}`));
  });

  document.getElementById("overview").textContent = result.overview.text;
  document.getElementById("overviewEvidence").replaceChildren();
  appendEvidence(document.getElementById("overviewEvidence"), result.overview.evidence);

  const insights = document.getElementById("insightList");
  insights.replaceChildren();
  result.keyInsights.forEach((finding) => insights.appendChild(renderFinding(finding)));

  const topics = document.getElementById("topicsList");
  topics.replaceChildren();
  if (!result.topics.length) {
    topics.appendChild(createElement("p", "muted", "No recurring topics could be identified from the visible text."));
  } else {
    result.topics.forEach((topic) => {
      const item = createElement("details", "topic-item");
      const summary = createElement("summary", "topic-chip");
      summary.append(
        createElement("span", "topic-label", topic.label),
        createElement("span", "topic-hint", "Possible topic"),
      );
      item.appendChild(summary);
      appendEvidence(item, topic.evidence);
      topics.appendChild(item);
    });
  }
  document.getElementById("structureSummary").textContent = result.contentStructure.text;
  document.getElementById("structureEvidence").replaceChildren();
  appendEvidence(document.getElementById("structureEvidence"), result.contentStructure.evidence);

  const typeNames = {
    "academic-journal": "Academic journal analysis",
    "research-paper": "Research paper analysis",
    "research-repository": "Research repository analysis",
    "news-article": "News article analysis",
    blog: "Blog analysis",
    shopping: "Product analysis",
    job: "Job and internship analysis",
    education: "Education and course analysis",
    documentation: "Documentation analysis",
    company: "Company and service analysis",
    forum: "Forum and discussion analysis",
    general: "General page analysis",
  };
  document.getElementById("specificHeading").textContent =
    `— ${typeNames[result.classification.type] || "Page-type analysis"}`;
  const specific = document.getElementById("specificAnalysis");
  specific.replaceChildren();
  if (!result.specific.length) {
    specific.appendChild(
      createElement("p", "muted", "No page-type-specific details were available in the extracted content."),
    );
  } else {
    result.specific.forEach((finding) => specific.appendChild(renderFinding(finding)));
  }

  const featured = document.getElementById("featuredList");
  featured.replaceChildren();
  if (!result.featured.length) {
    featured.appendChild(createElement("p", "muted", "No featured articles, products, or resources were confidently identified."));
  } else {
    result.featured.slice(0, 5).forEach((item) => {
      const card = createElement("article", "content-item featured-card");
      const anchor = createElement("a", "featured-link", item.title);
      anchor.href = item.url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      card.appendChild(anchor);
      card.appendChild(createElement("span", "link-kind", item.category));
      appendEvidence(card, item.evidence);
      featured.appendChild(card);
    });
    if (result.featured.length > 5) {
      featured.appendChild(createElement("p", "muted", `Showing 5 of ${result.featured.length} identified featured links. See Links and sources for more.`));
    }
  }

  const entities = document.getElementById("entitiesList");
  entities.replaceChildren();
  if (!result.entities.length) {
    entities.appendChild(createElement("p", "muted", "No named entities were confidently identified."));
  } else {
    result.entities.slice(0, 12).forEach((entity) => {
      const card = createElement("div", "content-item entity-card");
      card.append(
        createElement("strong", "", entity.name),
        createElement(
          "span",
          entity.kind.includes("heuristic") ? "entity-kind heuristic-entity" : "entity-kind",
          entity.kind,
        ),
      );
      appendEvidence(card, entity.evidence);
      entities.appendChild(card);
    });
  }

  const numberPreview = document.getElementById("numbersPreview");
  numberPreview.replaceChildren();
  const numbers = result.numbers || [];
  if (!numbers.length) {
    numberPreview.appendChild(createElement("p", "muted", "No notable numbers detected."));
  } else {
    numbers.slice(0, 4).forEach((number) =>
      numberPreview.appendChild(createElement("span", "tag", `${numberTypeLabel(number.type)}: ${number.value}`)),
    );
  }
  document.getElementById("numbersSummary").textContent =
    `Show all ${numbers.length} numerical findings`;
  const numberList = document.getElementById("numbersList");
  numberList.replaceChildren();
  numbers.forEach((number) => {
    const card = createElement("article", "content-item number-card");
    card.append(
      createElement("strong", "", `${numberTypeLabel(number.type)}: ${number.value}`),
      createElement("p", "muted", number.context || "No surrounding context was captured."),
    );
    appendEvidence(card, number.evidence);
    numberList.appendChild(card);
  });

  const linkGroups = document.getElementById("linkGroups");
  linkGroups.replaceChildren();
  renderLinkGroup(
    linkGroups,
    "Other internal pages and navigation",
    result.linkGroups.internal,
  );
  renderLinkGroup(linkGroups, "Research and article links", result.linkGroups.publications);
  renderLinkGroup(linkGroups, "External references", result.linkGroups.external);
  renderLinkGroup(linkGroups, "Downloadable resources", result.linkGroups.downloads);
  renderLinkGroup(linkGroups, "Social links", result.linkGroups.social);

  const headings = result.headings || [];
  const headingPreview = document.getElementById("headingsPreview");
  headingPreview.replaceChildren();
  if (!headings.length) {
    headingPreview.appendChild(createElement("p", "muted", "No headings detected."));
  } else {
    headings.slice(0, 4).forEach((heading) => {
      headingPreview.appendChild(renderHeadingItem(heading, false));
    });
  }
  document.getElementById("headingsSummary").textContent = `Show full heading structure (${headings.length})`;
  const headingList = document.getElementById("headingsList");
  headingList.replaceChildren();
  headings.forEach((heading) => {
    headingList.appendChild(renderHeadingItem(heading, true));
  });

  const paragraphs = result.textItems.filter((item) => ["p", "blockquote", "pre", "li"].includes(item.type));
  document.getElementById("contentSummary").textContent = `Show extracted text (${paragraphs.length} blocks)`;
  const contentList = document.getElementById("contentList");
  contentList.replaceChildren();
  paragraphs.forEach((item) => contentList.appendChild(renderFinding({
    title: item.section || item.type,
    text: item.text,
    mode: "direct",
    evidence: [{
      text: item.text,
      source: item.section || item.type,
      url: item.url || metadata.url,
      id: item.id,
    }],
  })));

  const tables = data.tables || [];
  const tablesList = document.getElementById("tablesList");
  tablesList.replaceChildren();
  tablesList.appendChild(createElement("h4", "subsection-title", `Tables (${tables.length})`));
  if (!tables.length) {
    tablesList.appendChild(createElement("p", "muted", "No tables detected."));
  }
  tables.forEach((table, index) => {
    const details = createElement("details", "disclosure table-disclosure");
    details.appendChild(createElement("summary", "", `${table.caption || `Table ${index + 1}`} · ${table.rows.length} rows`));
    const rows = createElement("div", "table-rows disclosure-content");
    table.rows.forEach((row) => rows.appendChild(createElement("div", "table-row", row.join(" | "))));
    appendEvidence(rows, [{
      text: `${table.caption || `Table ${index + 1}`}: ${table.rows.slice(0, 3).map((row) => row.join(" | ")).join(" · ")}`,
      source: table.section || "Extracted table",
      url: metadata.url,
      id: table.id,
    }]);
    details.appendChild(rows);
    tablesList.appendChild(details);
  });

  const images = data.images || [];
  const imagesList = document.getElementById("imagesList");
  imagesList.replaceChildren();
  imagesList.appendChild(createElement("h4", "subsection-title", `Media (${images.length})`));
  if (!images.length) {
    imagesList.appendChild(createElement("p", "muted", "No images detected."));
  }
  images.slice(0, 8).forEach((image) => {
    const card = createElement("div", "content-item image-card");
    card.append(
      createElement("strong", "", image.alt || "Image without alternative text"),
      createElement("span", "muted", `${image.width} × ${image.height}`),
    );
    if (/^https?:\/\//i.test(image.src || "")) {
      const source = createElement("a", "source-link", image.src);
      source.href = image.src;
      source.target = "_blank";
      source.rel = "noopener noreferrer";
      card.appendChild(source);
    }
    imagesList.appendChild(card);
  });
  if (images.length > 8) imagesList.appendChild(createElement("p", "muted", `Showing 8 of ${images.length} images.`));

  const statsGrid = document.getElementById("statsGrid");
  statsGrid.replaceChildren();
  [
    ["Words", statistics.wordCount],
    ["Headings", statistics.headings],
    ["Paragraphs", statistics.paragraphs],
    ["Links", statistics.links],
    ["Internal links", statistics.internalLinks],
    ["External links", statistics.externalLinks],
    ["Images", statistics.images],
    ["Tables", statistics.tables],
  ].forEach(([label, value]) => {
    const card = createElement("div", "stat-card");
    card.append(
      createElement("div", "stat-value", value || 0),
      createElement("div", "stat-label", label),
    );
    statsGrid.appendChild(card);
  });
  document.getElementById("extractionDetails").textContent =
    `Captured locally at ${data.extractedAt ? new Date(data.extractedAt).toLocaleString() : "an unknown time"}. ` +
    "Analysis uses extracted page text and metadata with deterministic rules; no remote service or AI model was used.";
  show(report);
}

analyzeBtn.addEventListener("click", analyzePage);
reanalyzeBtn.addEventListener("click", analyzePage);
