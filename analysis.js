(() => {
  const LABELS = {
    "academic-journal": "Academic journal",
    "research-paper": "Research paper",
    "research-repository": "Research repository",
    "news-article": "News article",
    blog: "Blog",
    shopping: "Shopping / product",
    job: "Job / internship",
    education: "Education / course",
    documentation: "Documentation / tutorial",
    company: "Company / service",
    forum: "Forum / discussion",
    general: "General",
  };
  const PAGE_PHRASES = {
    "academic-journal": "an academic journal homepage",
    "research-paper": "an individual research paper",
    "research-repository": "a research repository",
    "news-article": "a news article",
    blog: "a blog post",
    shopping: "a product or shopping page",
    job: "a job or internship listing",
    education: "an educational course or resource",
    documentation: "a documentation or tutorial page",
    company: "a company or service page",
    forum: "a forum or discussion page",
  };
  const STOP_WORDS = new Set(
    "about above after again against all also am an and any are as at based be because been before being below between both but by can could did do does doing down during each few featured for from further had has have having he her here hers herself him himself his how i if in into is it its itself just latest me method methods more most my myself need new no nor not of off on once only or other our ours ourselves out over own page paper papers improvement publication publications research report reports recent result results same she should so some study studies such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours article articles journal home homepage menu navigation career careers jobs position positions welcome".split(
      /\s+/,
    ),
  );

  function clean(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function textItems(data) {
    return data?.content?.textItems || [];
  }

  function makeEvidence(item, label, url) {
    if (item && typeof item === "object" && item.text) {
      return {
        text: clean(item.text).slice(0, 1200),
        source: item.section || item.type || label || "Page content",
        url: item.url || url || "",
        id: item.id || null,
        mode: "direct",
      };
    }
    return {
      text: clean(item || label),
      source: label || "Page metadata",
      url: url || "",
      id: null,
      mode: "direct",
    };
  }

  function findItem(data, pattern) {
    return textItems(data).find((item) => pattern.test(item.text));
  }

  function classify(data) {
    const metadata = data.metadata || {};
    const signals = data.signals || {};
    const structured = data.structuredData || [];
    const types = (signals.schemaTypes || structured.flatMap((entry) => entry.types || []))
      .map((type) => String(type).toLowerCase());
    const title = clean(metadata.title).toLowerCase();
    const description = clean(
      `${metadata.description || ""} ${metadata.openGraph?.description || ""}`,
    ).toLowerCase();
    const text = textItems(data).map((item) => item.text).join(" ").toLowerCase();
    const headings = (data.content?.headings || []).map((heading) => heading.text.toLowerCase());
    const headingsText = headings.join(" ");
    const url = (() => {
      try {
        return new URL(metadata.url);
      } catch {
        return null;
      }
    })();
    const host = url?.hostname.toLowerCase() || "";
    const site = host.replace(/^www\./, "");
    const path = `${url?.pathname || signals.urlPath || ""}`.toLowerCase();
    const scores = Object.fromEntries(Object.keys(LABELS).map((key) => [key, 0]));
    const evidence = Object.fromEntries(Object.keys(LABELS).map((key) => [key, []]));

    function add(category, weight, textEvidence, source) {
      scores[category] += weight;
      if (textEvidence && evidence[category].length < 6) {
        const sourceItem = typeof textEvidence === "object" ? textEvidence : null;
        evidence[category].push({
          text: clean(sourceItem ? sourceItem.text : textEvidence).slice(0, 220),
          source: (sourceItem && sourceItem.section) || source || "Extracted page signal",
          url: (sourceItem && sourceItem.url) || metadata.url || "",
          id: (sourceItem && sourceItem.id) || null,
          mode: "direct",
        });
      }
    }

    function hasType(...names) {
      return types.some((type) =>
        names.some((name) => type === name.toLowerCase() || type.endsWith(`/${name.toLowerCase()}`)),
      );
    }

    function matchItem(pattern) {
      return findItem(data, pattern);
    }

    const titleEvidence = metadata.title || metadata.openGraph?.title || "";
    const descriptionEvidence = metadata.description || metadata.openGraph?.description || "";
    const journalText = `${title} ${description} ${headingsText}`;
    const journalHeading = headings.find((heading) =>
      /\b(latest|recent|current)\s+(articles|papers|issue)|editorial board|aims and scope|for authors|submit (a )?(paper|manuscript)|call for papers/.test(heading),
    );
    const publicationLinks = (data.links || []).filter(
      (link) => link.kind === "publication" && link.text && link.text.length > 10,
    );
    const jobLinks = (data.links || []).filter((link) => /\/jobs?\/\d+|\/jobs?\/[a-z0-9-]+/i.test(link.url || ""));
    const articleHeadings = /abstract|introduction|methodology|methods|results|discussion|conclusion|references|bibliography/;
    const hasAbstract = /\babstract\b/.test(headingsText) || signals.hasAbstract;
    const hasPaperSections = headings.some((heading) =>
      /\b(methods?|methodology|results?|experiments?|findings|references|bibliography)\b/.test(heading),
    );
    const hasDoi = Boolean(metadata.doi || /\b10\.\d{4,9}\/[-._;()/:a-z0-9]+\b/i.test(text));
    const hasAuthors = Boolean(metadata.author) || structured.some((entry) => entry.author);

    if (hasType("Periodical", "AcademicJournal", "PublicationVolume")) {
      add("academic-journal", 9, "Structured data identifies a periodical or academic journal.");
    }
    if (/\bjournal of\b|\bacademic journal\b|\bscholarly journal\b/.test(title)) {
      add("academic-journal", 5, titleEvidence, "Page title");
    }
    if (/\b(journal|peer-reviewed|research publications)\b/.test(description)) {
      add("academic-journal", 2.5, descriptionEvidence, "Page description");
    }
    if (
      site === "jair.org" &&
      /artificial intelligence research/.test(`${title} ${description} ${journalText}`)
    ) {
      add("academic-journal", 3, "Journal of Artificial Intelligence Research", "Recognized journal title and domain");
    }
    if (journalHeading) {
      const sourceHeading = (data.content?.headings || []).find(
        (heading) => heading.text.toLowerCase() === journalHeading,
      );
      add("academic-journal", 2.5, sourceHeading || journalHeading, "Page heading");
    }
    if (publicationLinks.length >= 2 && /\b(journal|research|academic|publication)\b/.test(journalText)) {
      add("academic-journal", 2, `${publicationLinks.length} publication/article links detected`, "Link structure");
    }
    if (/\/(journals?|issues?|archives?)(\/|$)/.test(path) && !/\/(article|paper|abs)\//.test(path)) {
      add("academic-journal", 2, path, "URL pattern");
    }

    if (hasType("ScholarlyArticle", "ResearchArticle")) {
      add("research-paper", 10, "Structured data identifies a scholarly or research article.");
    } else if (hasType("Article") && (hasDoi || hasAbstract || hasPaperSections)) {
      add("research-paper", 5.5, "Article structured data combined with academic paper structure.");
    }
    if (hasAbstract) add("research-paper", 2.5, matchItem(/\babstract\b/i) || "Abstract section detected", "Page structure");
    if (hasPaperSections) {
      const paperHeadings = (data.content?.headings || [])
        .filter((heading) => articleHeadings.test(heading.text))
        .slice(0, 3);
      add(
        "research-paper",
        2.5,
        paperHeadings.length
          ? {
              text: paperHeadings.map((heading) => heading.text).join(" · "),
              id: paperHeadings[0].id,
              url: paperHeadings[0].url,
            }
          : headings.filter((heading) => articleHeadings.test(heading)).slice(0, 3).join(" · "),
        "Section headings",
      );
    }
    if (hasDoi) add("research-paper", 3, metadata.doi || matchItem(/\bdoi\b|10\.\d{4,9}\//i)?.text || "DOI detected", "Citation metadata");
    if (hasAuthors && (hasAbstract || hasPaperSections)) {
      add("research-paper", 1.5, metadata.author || "Author metadata accompanies paper sections.", "Page metadata");
    }
    if (/\/(abs|doi|paper|article|article\/view)\//.test(path) && hasAbstract) {
      add("research-paper", 2, path, "URL pattern");
    }
    if (/\/article\/view\/\d+/.test(path) && (hasAbstract || hasDoi || hasAuthors)) {
      add("research-paper", 6, path, "Individual journal article URL with scholarly metadata");
    }
    if (/^arxiv:\d{4}\.\d{4,5}/i.test(title)) add("research-paper", 3, titleEvidence, "Page title");

    if (host === "arxiv.org" && /\/(search|list|recent|archive|category)\b/.test(path)) {
      add("research-repository", 8, path, "Repository URL pattern");
    }
    if (hasType("DataCatalog", "CollectionPage") && /\b(research|paper|preprint|repository)\b/.test(text)) {
      add("research-repository", 5, "Structured collection page with research content.", "Structured data");
    }
    if (/\b(research repository|preprint server|open access repository)\b/.test(`${title} ${description}`)) {
      add("research-repository", 5, titleEvidence || descriptionEvidence, "Page metadata");
    }
    if (/\b(arxiv|preprints|research papers)\b/.test(host) && !/\/abs\//.test(path)) {
      add("research-repository", 4, host, "Domain");
    }

    if (hasType("NewsArticle", "ReportageNewsArticle")) {
      add("news-article", 9, "Structured data identifies a news article.", "Structured data");
    }
    if (metadata.openGraph?.type?.toLowerCase() === "article" && hasAuthors && metadata.published) {
      add("news-article", 3, "Article metadata includes author and publication date.", "OpenGraph metadata");
    }
    if (hasType("BlogPosting")) add("blog", 9, "Structured data identifies a blog post.", "Structured data");
    if (/\/(blog|posts?)\//.test(path)) add("blog", 2.5, path, "URL pattern");
    if (/\b(blog post|blog article|weblog)\b/.test(`${title} ${description}`)) {
      add("blog", 3, titleEvidence || descriptionEvidence, "Page metadata");
    }
    if (
      /\/(blog|posts?)\//.test(path) &&
      (hasAuthors ||
        metadata.published ||
        signals.hasArticle ||
        metadata.openGraph?.type?.toLowerCase() === "article")
    ) {
      add("blog", 3, "Post URL with article metadata or structure.", "Page structure");
    }
    if (hasAuthors && metadata.published && signals.hasArticle && !hasDoi) {
      add("news-article", 1.5, "Article structure with author and publication date.", "Page structure");
    }
    if (
      /(^|\.)((bbc|cnn|reuters|apnews|nytimes|theguardian|washingtonpost)\.com|npr\.org)$/.test(host) &&
      hasAuthors &&
      metadata.published &&
      signals.hasArticle
    ) {
      add("news-article", 3, host, "News publisher domain and article metadata");
    }

    if (hasType("Product")) add("shopping", 9, "Structured data identifies a product.", "Structured data");
    if (metadata.openGraph?.type?.toLowerCase() === "product") {
      add("shopping", 4, "OpenGraph metadata identifies a product page.", "OpenGraph metadata");
    }
    if (hasType("Offer") || structured.some((entry) => entry.price)) {
      add("shopping", 4, "Product offer or price is present in structured data.", "Structured data");
    }
    if (signals.hasProduct || signals.hasBuyAction) {
      add("shopping", 4, "Product details or purchase action detected in the page DOM.", "Page structure");
    }
    if (
      signals.hasBuyAction &&
      /\/(iphone|ipad|macbook|pixel|galaxy|products?|shop|store)([-/]|$)/i.test(path)
    ) {
      add("shopping", 3, path, "Product URL and purchase action");
    }
    if (/\b(add to cart|buy now|price|shipping|in stock|product details)\b/.test(text)) {
      add("shopping", 2, matchItem(/\b(add to cart|buy now|product details|in stock)\b/i)?.text || "Shopping terms in page text", "Page text");
    }
    if (/\/(products?|shop|dp|gp\/product)\//.test(path)) add("shopping", 2, path, "URL pattern");

    if (hasType("JobPosting")) add("job", 11, "Structured data identifies a job posting.", "Structured data");
    if (signals.hasApplyAction) add("job", 4, matchItem(/\b(apply now|apply for|submit application)\b/i)?.text || "Application action detected", "Page structure");
    if (jobLinks.length >= 2) {
      add("job", 4, `${jobLinks.length} job-detail links detected`, "Link structure");
    }
    if (headings.some((heading) => /\b(open roles|current openings|available positions|job listings)\b/i.test(heading))) {
      add("job", 2.5, headings.find((heading) => /\b(open roles|current openings|available positions|job listings)\b/i.test(heading)), "Page heading");
    }
    if (/\b(job description|qualifications|required skills|salary|internship|employment type)\b/.test(text)) {
      add("job", 2.5, matchItem(/\b(job description|qualifications|salary|internship)\b/i)?.text || "Job-related page text", "Page text");
    }
    if (/\/(jobs?|careers?|internships?)\//.test(path)) add("job", 2.5, path, "URL pattern");

    if (hasType("Course", "LearningResource", "EducationalOccupationalProgram")) {
      add("education", 8, "Structured data identifies a course or learning resource.", "Structured data");
    }
    if (/\b(course|syllabus|learning objectives|curriculum|prerequisites|lesson plan)\b/.test(`${title} ${description} ${headingsText}`)) {
      add("education", 3, titleEvidence || headings.find((heading) => /course|syllabus|curriculum|lesson/i.test(heading)), "Page metadata or headings");
    }
    if (/\/(courses?|learn|lessons?|education)\//.test(path)) add("education", 2, path, "URL pattern");

    if (hasType("TechArticle", "APIReference")) add("documentation", 8, "Structured data identifies technical documentation.", "Structured data");
    if (/\/(docs?|documentation|reference|api|guides?)\//.test(path)) add("documentation", 3, path, "URL pattern");
    if (/\b(documentation|api reference|developer guide|getting started|tutorial)\b/.test(`${title} ${description}`)) {
      add("documentation", 3, titleEvidence || descriptionEvidence, "Page metadata");
    }
    const documentationHeadings = headings.filter((heading) =>
      /guide|tutorial|example|reference|getting started|api/i.test(heading),
    );
    if (documentationHeadings.length) {
      const sourceHeading = (data.content?.headings || []).find((heading) =>
        documentationHeadings.includes(heading.text.toLowerCase()),
      );
      add(
        "documentation",
        signals.hasCode ? 2 : 2.5,
        {
          text: documentationHeadings.slice(0, 2).join(" · "),
          id: sourceHeading?.id,
          url: sourceHeading?.url,
        },
        signals.hasCode ? "Code and section structure" : "Documentation section headings",
      );
    }

    if (hasType("DiscussionForumPosting", "QAPage", "DiscussionForum")) {
      add("forum", 8, "Structured data identifies a forum or discussion.", "Structured data");
    }
    if (/\/(forum|forums|thread|discussions?|questions?)\//.test(path)) add("forum", 3, path, "URL pattern");
    if (/\b(replies|answers|join the discussion|post a reply)\b/.test(text)) {
      add("forum", 2, matchItem(/\b(replies|answers|join the discussion|post a reply)\b/i)?.text || "Discussion interaction text", "Page text");
    }

    if (hasType("Organization", "Corporation", "LocalBusiness", "Service")) {
      add("company", 2.5, "Organization or service structured data detected.", "Structured data");
    }
    if (
      hasType("Organization", "Corporation", "LocalBusiness", "Service") &&
      /\b(company|business|platform|software|service|services|solutions|customers|enterprise)\b/.test(`${title} ${description} ${headingsText}`)
    ) {
      add("company", 3, titleEvidence || descriptionEvidence, "Organization and service-related page language");
    }
    if (/\b(about us|our services|contact sales|solutions for|company overview)\b/.test(`${title} ${description} ${headingsText}`)) {
      add("company", 3, titleEvidence || headings.find((heading) => /about us|our services|company overview/i.test(heading)), "Page metadata or headings");
    }
    if (/\/(company|about|services?)\/?$/.test(path)) add("company", 2, path, "URL pattern");

    const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
    const [bestType, bestScore] = ranked[0];
    const runnerUp = ranked[1]?.[1] || 0;
    const ambiguous = bestScore < 7 && bestScore - runnerUp < 1;
    const primaryType = bestScore < 5 || ambiguous ? "general" : bestType;
    const primaryScore = scores[primaryType];
    const confidence =
      primaryType === "general"
        ? 0.35
        : Math.min(0.88, 0.5 + Math.min(0.2, primaryScore * 0.02) + Math.min(0.18, (primaryScore - runnerUp) * 0.035));
    const secondary = ranked
      .filter(([type, score]) => type !== primaryType && score >= 3 && score >= bestScore * 0.4)
      .slice(0, 3)
      .map(([type, score]) => ({
        type,
        label: LABELS[type],
        score,
        evidence: evidence[type],
      }));

    return {
      type: primaryType,
      label: LABELS[primaryType],
      confidence,
      score: primaryScore,
      uncertain: primaryType === "general",
      secondary,
      evidence: evidence[primaryType],
      scores,
      heuristic: true,
    };
  }

  function extractNumbers(data) {
    const patterns = [
      ["price", /(?:US\$|CA\$|A\$|USD|INR|Rs\.?|₹|\$|€|£)\s?\d[\d,]*(?:\.\d{1,2})?|\b\d[\d,]*(?:\.\d{1,2})?\s?(?:USD|INR|EUR|GBP)\b/gi],
      ["percentage", /\b\d+(?:\.\d+)?\s?%/g],
      ["date", /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+\d{4})\b/gi],
      ["rating", /\b(?:(?:rated?|rating|score)\s*(?:of\s*)?\d+(?:\.\d+)?(?:\s*(?:\/\s*5|out of 5|stars?))?|\d+(?:\.\d+)?\s*(?:\/\s*5|out of 5|stars?))\b/gi],
      ["measurement", /\b\d+(?:\.\d+)?\s?(?:mm|cm|m|km|inches|inch|ft|feet|kg|g|mg|lb|lbs|°[cf]|watts?|w|mah|gb|tb|mb|hz|ghz)\b/gi],
      ["quantity", /\b\d[\d,]*(?:\.\d+)?\s?(?:million|billion|thousand|users|people|items|employees|students|participants|downloads|reviews|pages|hours|days|years? old)\b/gi],
      ["statistic", /\b\d[\d,.]*(?:\s?(?:times|fold|points|score|cases|studies|papers|citations))\b/gi],
    ];
    const result = [];
    const seen = new Set();
    const add = (type, value, item, source) => {
      const key = `${type}:${value.toLowerCase()}`;
      if (!value || seen.has(key) || result.length >= 100) return;
      seen.add(key);
      result.push({
        type,
        value: clean(value),
        context: item?.text || source?.text || "",
        evidence: [
          item
            ? makeEvidence(item, "Numerical context", data.metadata?.url)
            : makeEvidence(source?.text || value, source?.source || "Structured data", data.metadata?.url),
        ],
      });
    };

    for (const item of textItems(data)) {
      for (const [type, regex] of patterns) {
        for (const match of item.text.matchAll(regex)) {
          add(type, match[0], item);
          if (result.length >= 100) break;
        }
      }
      const year = item.text.match(/\b(?:published|updated|established|founded|since|©)\s+(19\d{2}|20\d{2})\b/i);
      if (year) add("year", year[1], item);
      if (result.length >= 100) break;
    }

    (data.structuredData || []).forEach((entry) => {
      if (entry.price) {
        const currency = entry.priceCurrency ? `${entry.priceCurrency} ` : "";
        add("price", `${currency}${entry.price}`, null, {
          text: `Structured product offer: ${currency}${entry.price}`,
          source: "JSON-LD product offer",
        });
      }
      if (entry.ratingValue) {
        add("rating", `${entry.ratingValue}${entry.reviewCount ? ` (${entry.reviewCount} reviews)` : ""}`, null, {
          text: `Structured rating: ${entry.ratingValue}`,
          source: "JSON-LD aggregate rating",
        });
      }
    });
    return result;
  }

  function topicFindings(data) {
    const sources = [
      ...(data.metadata?.title
        ? [{ text: data.metadata.title, type: "Page title", section: "Page title", url: data.metadata.url, weight: 3.5 }]
        : []),
      ...(data.content?.headings || []).map((heading) => ({
        text: heading.text,
        id: heading.id,
        section: "Heading",
        weight: 3,
      })),
      ...(data.links || [])
        .filter((link) => link.kind === "publication" && link.text)
        .slice(0, 60)
        .map((link) => ({
          text: link.text,
          id: link.id,
          section: link.section || "Publication title",
          url: link.sourceUrl || data.metadata?.url,
          weight: 2,
        })),
      ...(data.content?.textItems || [])
        .filter((item) => item.type === "p")
        .slice(0, 30)
        .map((item) => ({ ...item, weight: 1 })),
    ];
    const counts = new Map();
    sources.forEach((source) => {
      const words = clean(source.text).toLowerCase().match(/[a-z][a-z0-9+#-]{2,}/g) || [];
      const sourceKey = `${source.section || source.type || ""}:${source.id || source.text.slice(0, 120)}`;
      for (let index = 0; index < words.length - 1; index++) {
        for (let width = 2; width <= 3 && index + width <= words.length; width++) {
          const phraseWords = words.slice(index, index + width);
          if (phraseWords.some((word) => STOP_WORDS.has(word))) continue;
          const phrase = phraseWords.join(" ");
          const item = counts.get(phrase) || { score: 0, evidence: [], sources: new Set() };
          if (!item.sources.has(sourceKey)) {
            item.score += source.weight * (width === 3 ? 1.9 : 1.6);
            item.sources.add(sourceKey);
            item.evidence.push(source);
          }
          counts.set(phrase, item);
        }
      }
    });
    const ranked = [...counts.entries()]
      .filter(([, result]) => result.sources.size >= 1 && result.score >= 3)
      .sort((a, b) => b[1].score - a[1].score);
    const selected = [];
    for (const [word, result] of ranked) {
      const words = word.split(" ");
      if (selected.some((topic) => topic.label.split(" ").some((token) => words.includes(token)))) continue;
      selected.push({
        label: word,
        score: result.score,
        evidence: result.evidence.slice(0, 3).map((source) =>
          makeEvidence(source, "Topic evidence", data.metadata?.url),
        ),
      });
      if (selected.length >= 8) break;
    }
    return selected;
  }

  function makeFinding(title, text, evidence, mode) {
    return {
      title,
      text: clean(text),
      mode: mode || "direct",
      evidence: (evidence || []).filter(Boolean).slice(0, 4),
    };
  }

  function sectionText(data, pattern) {
    const headings = data.content?.headings || [];
    const heading = headings.find((item) => pattern.test(item.text));
    if (!heading) return null;
    const related = textItems(data)
      .filter((item) => item.section === heading.text && !/^h[1-6]$/.test(item.type))
      .slice(0, 3);
    if (!related.length) return makeFinding(heading.text, heading.text, [makeEvidence(heading, "Section heading")]);
    return makeFinding(
      heading.text,
      related.map((item) => item.text).join(" "),
      related.map((item) => makeEvidence(item, heading.text)),
    );
  }

  function featuredLinks(data) {
    const links = (data.links || [])
      .filter((link) => {
        const text = clean(link.text);
        const value = `${text} ${link.url}`.toLowerCase();
        const path = (() => {
          try {
            return new URL(link.url).pathname.toLowerCase();
          } catch {
            return "";
          }
        })();
        return (
          text.length >= 12 &&
          !/^(home|about|contact|privacy|terms|sign in|log in|read more|learn more|menu|search)$/i.test(text) &&
          (link.kind === "publication" ||
            /\b(article|paper|research|publication|product|job|course|guide|tutorial)\b/.test(value) ||
            /\/(jobs?|internships?|careers?|courses?|products?|docs?|guides?)\//.test(path))
        );
      })
      .slice(0, 12);
    return links.map((link) => ({
      title: link.text,
      url: link.url,
      category:
        link.kind === "navigation" && /\/(jobs?|internships?|careers?)\//i.test(link.url)
          ? "job"
          : link.kind,
      external: Boolean(link.external),
      evidence: [makeEvidence({ text: link.text, section: link.section || "Link text", id: link.id, url: link.sourceUrl }, "Featured link")],
    }));
  }

  function specificAnalysis(data, classification, topics, featured, numbers) {
    const findings = [];
    const metadata = data.metadata || {};
    const structured = data.structuredData || [];
    const addMeta = (label, value, source) => {
      if (value) findings.push(makeFinding(label, Array.isArray(value) ? value.join(", ") : value, [makeEvidence(value, source, metadata.url)]));
    };
    const addSection = (label, pattern) => {
      const value = sectionText(data, pattern);
      if (value) findings.push(makeFinding(label, value.text, value.evidence));
    };
    const authors =
      metadata.author ||
      structured.flatMap((entry) => (Array.isArray(entry.author) ? entry.author : [entry.author]).filter(Boolean));
    const type = classification.type;

    if (type === "academic-journal") {
      addMeta("Journal purpose", metadata.description || metadata.openGraph?.description, "Journal description");
      const researchAreas = topics.slice(0, 5);
      if (researchAreas.length) {
        findings.push(
          makeFinding(
            "Main research areas",
            researchAreas.map((topic) => topic.label).join(", "),
            researchAreas.flatMap((topic) => topic.evidence),
            "heuristic",
          ),
        );
      }
      if (featured.length) {
        findings.push(makeFinding("Recent publications", `${featured.length} article or publication links found.`, featured.slice(0, 3).flatMap((link) => link.evidence)));
      }
      const journalAuthors = structured
        .flatMap((entry) => (Array.isArray(entry.author) ? entry.author : [entry.author]))
        .filter(Boolean);
      if (journalAuthors.length) {
        addMeta("Authors in detected publications", [...new Set(journalAuthors)].slice(0, 8), "Scholarly structured data");
      }
      addMeta("Journal / publisher", metadata.siteName, "Website name metadata");
    } else if (type === "research-paper") {
      addMeta("Paper title", metadata.title, "Page title");
      addMeta("Authors", authors, "Author metadata");
      addMeta("Abstract", structured.find((entry) => entry.abstract)?.abstract, "Scholarly structured data");
      addSection("Abstract", /^abstract$/i);
      addSection("Research problem", /problem|motivation|introduction/i);
      addSection("Methodology", /method|approach|architecture|experiment design/i);
      addSection("Findings", /results?|findings|evaluation|experiments?/i);
      addSection("Limitations", /limitations?|threats to validity/i);
      addSection("References", /references|bibliography|works cited/i);
      addMeta("Publication date", metadata.published, "Publication metadata");
    } else if (type === "research-repository") {
      addMeta("Repository", metadata.siteName || metadata.domain, "Website metadata");
      findings.push(makeFinding("Repository content", `${featured.length} research or resource links identified.`, featured.slice(0, 4).flatMap((link) => link.evidence)));
    } else if (type === "job") {
      const job = structured.find((entry) => entry.types?.some((value) => /JobPosting/i.test(value))) || {};
      const availableRoles = featured.filter((item) => /\/jobs?\//i.test(item.url));
      const organizationFromTitle = metadata.title?.match(/^(?:jobs?|careers?)\s+at\s+(.+)$/i)?.[1];
      if (availableRoles.length > 1) {
        findings.push(
          makeFinding(
            "Available roles",
            availableRoles.slice(0, 8).map((item) => item.title).join(" · "),
            availableRoles.slice(0, 4).flatMap((item) => item.evidence),
          ),
        );
      } else {
        addMeta("Role", job.jobTitle || metadata.title, "Job title or page title");
      }
      addMeta(
        "Organization",
        job.organization || organizationFromTitle || metadata.siteName,
        "Structured organization or page title metadata",
      );
      addMeta("Location", job.jobLocation, "Job structured data");
      addMeta("Eligibility and qualifications", job.qualifications || job.skills, "Job structured data");
      addMeta("Application deadline", job.validThrough, "Job structured data");
      addMeta("Employment type", job.employmentType, "Job structured data");
      addMeta(
        "Salary or stipend",
        job.salary || numbers.filter((number) => number.type === "price").map((number) => number.value),
        job.salary ? "Job structured data" : "Extracted numerical data",
      );
      addSection("Requirements and qualifications", /requirements?|qualifications?|skills|eligibility/i);
    } else if (type === "shopping") {
      const product = structured.find((entry) => entry.types?.some((value) => /Product/i.test(value))) || {};
      addMeta("Product", product.name || metadata.title, "Product or page title");
      addMeta("Brand", product.brand, "Product structured data");
      addMeta("Price and discounts", numbers.filter((number) => number.type === "price" || number.type === "percentage").map((number) => number.value), "Extracted numerical data");
      addMeta("Rating and reviews", product.ratingValue ? `${product.ratingValue}${product.reviewCount ? ` (${product.reviewCount} reviews)` : ""}` : null, "Product structured data");
      addSection("Specifications", /specifications?|details|features/i);
    } else if (type === "education") {
      const course = structured.find((entry) => entry.types?.some((value) => /Course|LearningResource/i.test(value))) || {};
      addMeta("Subject", metadata.title, "Page title");
      addMeta("Learning objectives", course.teaches, "Course structured data");
      addMeta("Level", course.educationalLevel, "Course structured data");
      addSection("Objectives and outcomes", /objectives?|outcomes?|what you.?ll learn/i);
      addSection("Prerequisites", /prerequisites?|requirements/i);
    } else if (type === "documentation") {
      addMeta("Technology or tool", metadata.title, "Page title");
      addMeta("Purpose", metadata.description, "Page description");
      addMeta("Code examples", textItems(data).filter((item) => item.type === "pre").length, "Extracted code blocks");
      addSection("Instructions", /getting started|installation|usage|tutorial|guide/i);
      addSection("Referenced APIs", /api|reference|methods|properties/i);
    } else if (type === "news-article" || type === "blog") {
      addMeta("Main subject", metadata.title, "Page title");
      addMeta("Author", authors, "Author metadata");
      addMeta("Publication date", metadata.published, "Publication metadata");
      addSection("Key arguments and facts", /key points|highlights|findings|results|conclusion/i);
      if (!findings.some((finding) => finding.title === "Key arguments and facts")) {
        const body = textItems(data).find((item) => item.type === "p");
        if (body) findings.push(makeFinding("Article text", body.text, [makeEvidence(body, "Article paragraph")]));
      }
    } else if (type === "company") {
      addMeta("Organization", metadata.siteName || metadata.title, "Page metadata");
      addMeta("Purpose", metadata.description, "Page description");
      addSection("Services and offerings", /services?|solutions|products|what we do/i);
    } else if (type === "forum") {
      addMeta("Discussion topic", metadata.title, "Page title");
      addSection("Discussion content", /discussion|question|answers?|replies/i);
    } else {
      addMeta("Page title", metadata.title, "Page title");
      addMeta("Description", metadata.description, "Page description");
    }
    return findings.filter((finding) => finding.text);
  }

  function analyze(data) {
    const safeData = data || {};
    const classification = classify(safeData);
    const metadata = safeData.metadata || {};
    const topics = topicFindings(safeData);
    const numbers = extractNumbers(safeData);
    const featured = featuredLinks(safeData);
    const description = metadata.description || metadata.openGraph?.description;
    const firstParagraph = textItems(safeData).find((item) => item.type === "p");
    const overviewEvidence = description
      ? [makeEvidence(description, "Page description", metadata.url)]
      : firstParagraph
        ? [makeEvidence(firstParagraph, "Page overview", metadata.url)]
        : [];
    const overviewText = description || firstParagraph?.text || "No descriptive overview was detected in the extracted page content.";
    const overview = makeFinding(
      "Page overview",
      classification.type === "general"
        ? overviewText
        : `This page appears to be ${PAGE_PHRASES[classification.type]}. ${overviewText}`,
      overviewEvidence,
      classification.type === "general" ? "direct" : "heuristic",
    );

    const keyInsights = [];
    if (description) {
      keyInsights.push(makeFinding("Page description", description, [makeEvidence(description, "Page metadata", metadata.url)]));
    }
    const abstract = sectionText(safeData, /^abstract$/i);
    if (abstract) keyInsights.push(makeFinding("Abstract", abstract.text, abstract.evidence));
    textItems(safeData)
      .filter((item) => item.type === "p" && item.text.length > 70)
      .slice(0, keyInsights.length ? 2 : 3)
      .forEach((item, index) => {
        if (!keyInsights.some((finding) => finding.text === item.text)) {
          keyInsights.push(makeFinding(index ? "Content highlight" : "Key content", item.text, [makeEvidence(item, "Page paragraph")]));
        }
      });
    if (!keyInsights.length) {
      keyInsights.push(makeFinding("Key insights", "There is not enough visible page text to derive content insights.", [], "heuristic"));
    }

    const headings = safeData.content?.headings || [];
    const headingEvidence = headings.slice(0, 12).map((heading) => makeEvidence(heading, "Page heading", metadata.url));
    const contentStructure = makeFinding(
      "Content structure",
      headings.length
        ? `The page has ${headings.length} detected headings. Its visible section sequence begins: ${headings.slice(0, 8).map((heading) => heading.text).join(" → ")}.`
        : "No visible heading hierarchy was detected; the page may be organized through other elements.",
      headingEvidence,
      "heuristic",
    );
    const entities = [];
    const addEntity = (name, kind, evidence) => {
      const normalized = clean(name);
      if (!normalized || entities.some((entity) => entity.name.toLowerCase() === normalized.toLowerCase())) return;
      entities.push({ name: normalized, kind, evidence: evidence || [] });
    };
    if (metadata.siteName) addEntity(metadata.siteName, "Website / organization", [makeEvidence(metadata.siteName, "Website name", metadata.url)]);
    if (metadata.author) {
      `${metadata.author}`.split(/\s*[;,]\s*/).filter(Boolean).slice(0, 8).forEach((author) =>
        addEntity(author, "Author", [makeEvidence(author, "Author metadata", metadata.url)]),
      );
    }
    (safeData.structuredData || []).forEach((entry) => {
      if (entry.organization) addEntity(entry.organization, "Organization", [makeEvidence(entry.organization, "Structured data", metadata.url)]);
      (Array.isArray(entry.author) ? entry.author : [entry.author]).filter(Boolean).forEach((author) =>
        addEntity(author, "Author", [makeEvidence(author, "Structured data", metadata.url)]),
      );
    });
    const namedTerms = new Map();
    textItems(safeData)
      .slice(0, 100)
      .forEach((item) => {
        const matches = item.text.match(/\b(?:[A-Z][a-zA-Z0-9&.-]+(?:\s+[A-Z][a-zA-Z0-9&.-]+){1,4})\b/g) || [];
        matches.forEach((match) => {
          const value = clean(match);
          if (/^(The|This|These|There|What|When|Where|Section|Read More|Learn More)\b/.test(value)) return;
          const term = namedTerms.get(value) || { items: new Map() };
          term.items.set(item.id || item.section || item.text, item);
          namedTerms.set(value, term);
        });
      });
    [...namedTerms.entries()]
      .filter(([, term]) => term.items.size >= 2)
      .slice(0, 8)
      .forEach(([name, term]) =>
      addEntity(
        name,
        "Mentioned phrase · heuristic",
        [...term.items.values()].slice(0, 2).map((item) => makeEvidence(item, "Repeated page text")),
      ),
    );

    const links = safeData.links || [];
    const statistics = safeData.statistics || {};
    const linkCounts = {
      total: Number.isFinite(statistics.links) ? statistics.links : links.length,
      internal: Number.isFinite(statistics.internalLinks)
        ? statistics.internalLinks
        : links.filter((link) => !link.external).length,
      external: Number.isFinite(statistics.externalLinks)
        ? statistics.externalLinks
        : links.filter((link) => link.external).length,
    };
    if (linkCounts.total) {
      keyInsights.push(makeFinding(
        "Link distribution",
        `${linkCounts.total} links extracted: ${linkCounts.internal} internal and ${linkCounts.external} external. Publication, download, and social links are included in these totals.`,
        links.slice(0, 3).map((link) =>
          makeEvidence({ text: link.text || link.url, section: "Page link", id: link.id, url: link.sourceUrl }, "Link analysis"),
        ),
        "heuristic",
      ));
    }

    return {
      classification,
      overview,
      keyInsights: keyInsights.slice(0, 6),
      topics,
      contentStructure,
      specific: specificAnalysis(safeData, classification, topics, featured, numbers),
      featured,
      entities: entities.slice(0, 20),
      numbers,
      linkGroups: {
        internal: (safeData.links || []).filter((link) => !link.external && !["publication", "download", "social"].includes(link.kind)),
        publications: (safeData.links || []).filter((link) => link.kind === "publication"),
        external: (safeData.links || []).filter((link) => link.external && !["publication", "download", "social"].includes(link.kind)),
        social: (safeData.links || []).filter((link) => link.kind === "social"),
        downloads: (safeData.links || []).filter((link) => link.kind === "download"),
      },
      structure: contentStructure,
      headings: headings.slice(0, 100),
      textItems: textItems(safeData),
      metadata,
      statistics: safeData.statistics || {},
      extractedAt: safeData.extractedAt || null,
    };
  }

  globalThis.PageScopeAnalysis = { analyze, classify, extractNumbers, LABELS };
})();
