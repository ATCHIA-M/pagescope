(() => {
  if (window.__pageScopeInstalled) return;
  window.__pageScopeInstalled = true;

  const LIMITS = {
    textItems: 250,
    textItemLength: 2500,
    fullTextLength: 120000,
    headings: 100,
    links: 150,
    images: 100,
    tables: 20,
    tableRows: 20,
    tableColumns: 8,
    listItems: 20,
    structuredData: 30,
  };
  const EXCLUDED =
    "script,style,noscript,svg,nav,footer,header,aside,form,button,input,select,textarea,[hidden],[aria-hidden='true']";

  function clean(text, limit) {
    const value = (text || "").replace(/\s+/g, " ").trim();
    return limit ? value.slice(0, limit) : value;
  }

  function isVisible(element) {
    if (!element.getClientRects().length || element.closest(EXCLUDED)) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function selectVisible(root, selector, limit) {
    return [...root.querySelectorAll(selector)].filter(isVisible).slice(0, limit);
  }

  function getMeta(...names) {
    for (const name of names) {
      const element = document.querySelector(
        `meta[name="${name}"],meta[property="${name}"],meta[itemprop="${name}"]`,
      );
      if (element?.content?.trim()) return clean(element.content, 1500);
    }
    return null;
  }

  function sourceId(element) {
    return element.id || element.closest("section[id],article[id],[role='region'][id]")?.id || null;
  }

  function getMainContent() {
    return (
      document.querySelector("main,article,[role='main']") ||
      document.body ||
      document.documentElement
    );
  }

  function extractText(root) {
    const elements = selectVisible(
      root,
      "h1,h2,h3,h4,h5,h6,p,blockquote,pre,li,dt,dd,figcaption",
      2000,
    );
    const items = [];
    const seen = new Set();
    let activeSection = null;
    let activeSectionId = null;
    let totalLength = 0;

    for (const element of elements) {
      const type = element.tagName.toLowerCase();
      const text = clean(element.innerText || element.textContent, LIMITS.textItemLength);
      if (/^h[1-6]$/.test(type)) {
        activeSection = text || activeSection;
        activeSectionId = sourceId(element);
      }
      if (element.parentElement?.closest("p,blockquote,pre")) continue;
      if (type === "li" && element.parentElement?.closest("li")) continue;
      if (text.length < 20 || seen.has(`${type}:${text}`)) continue;

      const separatorLength = items.length ? 2 : 0;
      if (
        items.length >= LIMITS.textItems ||
        totalLength + separatorLength + text.length > LIMITS.fullTextLength
      ) {
        break;
      }

      seen.add(`${type}:${text}`);
      totalLength += separatorLength + text.length;
      items.push({
        type,
        tag: type,
        text,
        section: /^h[1-6]$/.test(type) ? null : activeSection,
        id: element.id || activeSectionId || sourceId(element),
        url: location.href,
      });
    }
    return items;
  }

  function extractHeadings(root) {
    return selectVisible(root, "h1,h2,h3,h4,h5,h6", LIMITS.headings)
      .map((element) => ({
        level: Number(element.tagName[1]),
        text: clean(element.innerText || element.textContent, 500),
        id: sourceId(element),
        url: location.href,
      }))
      .filter((heading) => heading.text);
  }

  function extractStructuredData() {
    const entries = [];
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')]
      .slice(0, 20);
    const readText = (value) => {
      if (typeof value === "string" || typeof value === "number") {
        return clean(String(value), 1200) || null;
      }
      if (Array.isArray(value)) {
        return value.map(readText).filter(Boolean).slice(0, 12);
      }
      if (value && typeof value === "object") {
        return clean(value.name || value.alternateName || value["@id"] || "", 300) || null;
      }
      return null;
    };

    function collect(value, depth) {
      if (entries.length >= LIMITS.structuredData || depth > 6 || !value) return;
      if (Array.isArray(value)) {
        value.slice(0, 30).forEach((item) => collect(item, depth + 1));
        return;
      }
      if (typeof value !== "object") return;
      if (value["@graph"]) collect(value["@graph"], depth + 1);
      if (value["@type"]) {
        const offers = Array.isArray(value.offers) ? value.offers[0] : value.offers;
        const rating = value.aggregateRating || {};
        const publisher = value.publisher || value.organization || {};
        const jobLocation = Array.isArray(value.jobLocation)
          ? value.jobLocation[0]
          : value.jobLocation;
        const address = jobLocation?.address || {};
        const baseSalary = value.baseSalary;
        const entry = {
          types: (Array.isArray(value["@type"]) ? value["@type"] : [value["@type"]])
            .map((type) => clean(type, 100))
            .filter(Boolean),
        };
        [
          "name",
          "headline",
          "description",
          "articleSection",
          "abstract",
          "datePublished",
          "dateModified",
          "datePosted",
          "validThrough",
          "url",
          "inLanguage",
          "keywords",
          "identifier",
          "doi",
          "jobTitle",
          "employmentType",
          "qualifications",
          "skills",
          "responsibilities",
          "teaches",
          "educationalLevel",
          "price",
          "priceCurrency",
          "ratingValue",
          "reviewCount",
          "brand",
          "datePosted",
          "validThrough",
        ].forEach((key) => {
          const valueText = readText(value[key]);
          if (valueText) entry[key] = valueText;
        });
        const authors = readText(value.author);
        if (authors) entry.author = authors;
        const organization = readText(value.hiringOrganization || publisher);
        if (organization) entry.organization = organization;
        const location = [
          readText(jobLocation?.name),
          readText(address.addressLocality),
          readText(address.addressRegion),
          readText(address.addressCountry),
        ].filter(Boolean);
        if (location.length) entry.jobLocation = location.join(", ");
        const salaryValue = baseSalary?.value;
        let salary = readText(salaryValue || baseSalary);
        if (salaryValue && typeof salaryValue === "object") {
          const low = readText(salaryValue.minValue);
          const high = readText(salaryValue.maxValue);
          const range = low && high ? `${low}–${high}` : low || high;
          const unit = readText(salaryValue.unitText);
          if (range) salary = [range, unit].filter(Boolean).join(" ");
        }
        const salaryCurrency = readText(value.baseSalary?.currency);
        if (salary) entry.salary = `${salaryCurrency ? `${salaryCurrency} ` : ""}${salary}`;
        const price = readText(offers?.price);
        const currency = readText(offers?.priceCurrency);
        if (price) entry.price = price;
        if (currency) entry.priceCurrency = currency;
        const ratingValue = readText(rating.ratingValue);
        if (ratingValue) entry.ratingValue = ratingValue;
        const reviewCount = readText(rating.reviewCount);
        if (reviewCount) entry.reviewCount = reviewCount;
        entries.push(entry);
      }
      ["mainEntity", "itemListElement"].forEach((key) => {
        if (value[key]) collect(value[key], depth + 1);
      });
    }

    for (const script of scripts) {
      if (script.textContent.length > 100000) continue;
      try {
        collect(JSON.parse(script.textContent), 0);
      } catch {
        // Malformed JSON-LD on the page does not prevent DOM extraction.
      }
    }
    return entries;
  }

  function getLinkKind(text, url) {
    const value = `${text} ${url}`.toLowerCase();
    if (/facebook\.com|instagram\.com|linkedin\.com|x\.com|twitter\.com|youtube\.com|tiktok\.com|reddit\.com/.test(url)) {
      return "social";
    }
    if (/\.(pdf|docx?|pptx?|xlsx?|zip|csv)(?:$|[?#])/.test(url) || /\b(download|supplement|dataset|source code)\b/.test(value)) {
      return "download";
    }
    if (/\/(jobs?|careers?|internships?)\//.test(url) || /\b(apply now|job listing|internship)\b/.test(value)) {
      return "job";
    }
    if (/\/(courses?|lessons?|classes?)\//.test(url) || /\b(course|lesson|class)\b/.test(value)) {
      return "course";
    }
    if (/\/(docs?|documentation|guides?|tutorials?)\//.test(url) || /\b(documentation|tutorial|developer guide)\b/.test(value)) {
      return "guide";
    }
    if (/\/(products?|shop|store|dp|gp\/product)\//.test(url) || /\b(product details|shop now)\b/.test(value)) {
      return "product";
    }
    if (/\b(article|paper|publication|journal|doi|proceedings|abstract|research)\b/.test(value) || /\/(article|paper|publication|abs|doi)\//.test(url)) {
      return "publication";
    }
    return "navigation";
  }

  function normalizedHost(hostname) {
    return hostname.toLowerCase().replace(/^www\./, "");
  }

  function extractLinks() {
    const links = [];
    for (const element of selectVisible(document, "a[href]", 2000)) {
      try {
        const url = new URL(element.href, location.href);
        if (url.protocol !== "http:" && url.protocol !== "https:") continue;
        const text = clean(element.innerText || element.getAttribute("aria-label"), 300);
        links.push({
          text,
          url: url.href,
          domain: url.hostname,
          external: normalizedHost(url.hostname) !== normalizedHost(location.hostname),
          kind: getLinkKind(text, url.href),
          section: element.closest("section,article")?.querySelector("h1,h2,h3,h4")?.textContent?.trim() || null,
          id: sourceId(element),
          sourceUrl: location.href,
        });
        if (links.length >= LIMITS.links) break;
      } catch {
        // Ignore malformed page-provided URLs.
      }
    }
    return links;
  }

  function extractImages() {
    return selectVisible(document, "img", 1000)
      .slice(0, LIMITS.images)
      .map((image) => ({
        alt: clean(image.alt, 300),
        src: image.currentSrc || image.src,
        width: image.naturalWidth || image.width || 0,
        height: image.naturalHeight || image.height || 0,
        id: sourceId(image),
        url: location.href,
      }))
      .filter((image) => image.src);
  }

  function extractTables() {
    return selectVisible(document, "table", LIMITS.tables).map((table) => ({
      caption: clean(table.caption?.innerText, 300),
      id: sourceId(table),
      section: table.closest("section,article")?.querySelector("h1,h2,h3,h4")?.textContent?.trim() || null,
      rows: [...table.rows].slice(0, LIMITS.tableRows).map((row) =>
        [...row.cells]
          .slice(0, LIMITS.tableColumns)
          .map((cell) => clean(cell.innerText, 200)),
      ),
    }));
  }

  function extractLists(root) {
    return selectVisible(root, "ul,ol", 50)
      .map((list) => ({
        type: list.tagName.toLowerCase(),
        id: sourceId(list),
        section: list.closest("section,article")?.querySelector("h1,h2,h3,h4")?.textContent?.trim() || null,
        items: [...list.querySelectorAll(":scope > li")]
          .slice(0, LIMITS.listItems)
          .map((item) => clean(item.innerText, 500))
          .filter(Boolean),
      }))
      .filter((list) => list.items.length);
  }

  function extractPage() {
    const root = getMainContent();
    const textItems = extractText(root);
    const headings = extractHeadings(root);
    const fullText = textItems.map((item) => item.text).join("\n\n").slice(0, LIMITS.fullTextLength);
    const links = extractLinks();
    const images = extractImages();
    const tables = extractTables();
    const lists = extractLists(root);
    const structuredData = extractStructuredData();
    const openGraph = {
      title: getMeta("og:title"),
      type: getMeta("og:type"),
      description: getMeta("og:description"),
      url: getMeta("og:url"),
      siteName: getMeta("og:site_name"),
    };
    const schemaTypes = [...new Set(structuredData.flatMap((entry) => entry.types))];
    const paragraphs = textItems.filter((item) => item.type === "p").length;
    const canonical = document.querySelector('link[rel="canonical"]')?.href || null;
    const actions = selectVisible(document, "a,button,[role='button']", 1000)
      .map((element) => clean(element.innerText || element.getAttribute("aria-label"), 100).toLowerCase());
    const jobLinks = links.filter((link) => /\/jobs?\/\d+|\/jobs?\/[a-z0-9-]+/i.test(link.url));

    return {
      version: 2,
      metadata: {
        title: clean(document.title, 500) || null,
        url: location.href,
        domain: location.hostname,
        description: getMeta("description", "og:description"),
        author: getMeta("author", "article:author", "citation_author"),
        published: getMeta(
          "article:published_time",
          "datePublished",
          "citation_publication_date",
          "date",
          "pubdate",
        ),
        siteName: openGraph.siteName || location.hostname,
        canonical,
        language: document.documentElement.lang || null,
        openGraph,
        keywords: getMeta("keywords", "news_keywords"),
        doi: getMeta("citation_doi", "dc.identifier", "doi"),
      },
      structuredData,
      signals: {
        schemaTypes,
        urlPath: location.pathname,
        hasArticle: Boolean(document.querySelector("article")),
        hasMain: Boolean(document.querySelector("main,[role='main']")),
        hasProduct: Boolean(document.querySelector('[itemtype*="Product"],[itemprop="price"]')),
        hasJobPosting: schemaTypes.includes("JobPosting"),
        hasAbstract: Boolean(document.querySelector('[class*="abstract" i],[id*="abstract" i]')),
        hasCode: Boolean(root.querySelector("pre,code")),
        hasBuyAction: actions.some((text) => /\b(add to cart|add to bag|buy|buy now|purchase|check availability)\b/.test(text)),
        hasApplyAction: actions.some((text) => /\b(apply now|apply for|submit application)\b/.test(text)),
        jobLinks: jobLinks.length,
      },
      classification: null,
      content: {
        headings,
        textItems,
        fullText,
        wordCount: fullText.split(/\s+/).filter(Boolean).length,
      },
      links,
      images,
      tables,
      lists,
      numbers: [],
      statistics: {
        headings: headings.length,
        paragraphs,
        links: links.length,
        internalLinks: links.filter((link) => !link.external).length,
        externalLinks: links.filter((link) => link.external).length,
        images: images.length,
        tables: tables.length,
        lists: lists.length,
        wordCount: fullText.split(/\s+/).filter(Boolean).length,
      },
      extractedAt: new Date().toISOString(),
    };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.action !== "PAGESCOPE_EXTRACT") return;
    try {
      sendResponse({ success: true, data: extractPage() });
    } catch (error) {
      console.error("PageScope extraction failed:", error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
})();
