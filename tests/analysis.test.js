const assert = require("node:assert/strict");
require("../analysis.js");

const { analyze, classify } = globalThis.PageScopeAnalysis;

function fixture({
  url = "https://example.test/",
  title = "Example",
  description = "",
  headings = [],
  paragraphs = [],
  schemaTypes = [],
  structuredData = [],
  links = [],
  signals = {},
  metadata = {},
} = {}) {
  const pageUrl = new URL(url);
  const headingItems = headings.map((text, index) => ({
    level: index ? 2 : 1,
    text,
    id: `heading-${index}`,
    url,
  }));
  const textItems = [
    ...headingItems.map((heading) => ({
      type: `h${heading.level}`,
      text: heading.text,
      id: heading.id,
      url,
    })),
    ...paragraphs.map((text, index) => ({
      type: "p",
      text,
      section: headings[0] || null,
      id: `paragraph-${index}`,
      url,
    })),
  ];
  return {
    metadata: {
      title,
      description,
      url,
      domain: pageUrl.hostname,
      siteName: pageUrl.hostname,
      openGraph: {},
      ...metadata,
    },
    signals: { schemaTypes, urlPath: pageUrl.pathname, ...signals },
    structuredData,
    content: { headings: headingItems, textItems, fullText: textItems.map((item) => item.text).join(" ") },
    links,
    tables: [],
    images: [],
    lists: [],
    statistics: { headings: headings.length, paragraphs: paragraphs.length, links: links.length },
    extractedAt: new Date().toISOString(),
  };
}

const cases = [
  {
    name: "JAIR homepage is an academic journal, not a paper",
    expected: "academic-journal",
    data: fixture({
      url: "https://www.jair.org/index.php/jair",
      title: "Journal of Artificial Intelligence Research",
      description: "The Journal of Artificial Intelligence Research publishes peer-reviewed research.",
      headings: ["Recent Articles", "Aims and Scope", "About the Journal"],
      links: [
        { text: "Research paper on planning", url: "https://jair.org/article/view/1", kind: "publication", external: false },
        { text: "Research paper on learning", url: "https://jair.org/article/view/2", kind: "publication", external: false },
      ],
    }),
  },
  {
    name: "Individual arXiv paper",
    expected: "research-paper",
    data: fixture({
      url: "https://arxiv.org/abs/1706.03762",
      title: "Attention Is All You Need",
      description: "We propose a new simple network architecture.",
      headings: ["Abstract", "Introduction", "Methodology", "Results", "References"],
      paragraphs: ["We propose a new network architecture based solely on attention mechanisms."],
      metadata: { author: "Ashish Vaswani", doi: "10.48550/arXiv.1706.03762" },
    }),
  },
  {
    name: "Individual JAIR paper is not the journal homepage",
    expected: "research-paper",
    data: fixture({
      url: "https://www.jair.org/article/view/321",
      title: "Action Selection in Artificial Intelligence",
      description: "We study an approach to planning.",
      headings: ["Abstract", "Introduction", "Methods", "Results", "References"],
      paragraphs: ["This paper presents a new approach to action selection."],
      metadata: { author: "Research Author", doi: "10.1613/jair.321" },
    }),
  },
  {
    name: "JAIR paper stays a paper when publisher text names the journal",
    expected: "research-paper",
    data: fixture({
      url: "https://www.jair.org/article/view/987",
      title: "Journal of Artificial Intelligence Research | A Planning Method",
      description: "The Journal of Artificial Intelligence Research publishes this peer-reviewed paper.",
      headings: ["Abstract", "Methods", "Results"],
      metadata: { author: "Research Author", doi: "10.1613/jair.987" },
    }),
  },
  {
    name: "Research repository listing",
    expected: "research-repository",
    data: fixture({
      url: "https://arxiv.org/list/cs.AI/recent",
      title: "Artificial Intelligence recent submissions",
      description: "Browse research preprints and papers.",
    }),
  },
  {
    name: "News article",
    expected: "news-article",
    data: fixture({
      url: "https://www.npr.org/2026/11/18/nx-s1-6034426/sanfilippo-syndrome-gene-therapy",
      title: "How a viral video gave a huge boost to new gene therapy",
      description: "NPR science reporting on a family and the promises and challenges of drug development.",
      metadata: { author: "Sydney Lupkin", published: "2026-11-18", openGraph: { type: "article" } },
      signals: { hasArticle: true },
    }),
  },
  {
    name: "Blog post",
    expected: "blog",
    data: fixture({
      url: "https://example.test/blog/research-notes",
      title: "Research notes",
      schemaTypes: ["BlogPosting"],
    }),
  },
  {
    name: "Product page",
    expected: "shopping",
    data: fixture({
      url: "https://shop.example.test/products/device",
      title: "Device product details",
      schemaTypes: ["Product"],
      structuredData: [{ types: ["Product"], name: "Device", price: "99", priceCurrency: "USD" }],
      signals: { hasProduct: true, hasBuyAction: true },
    }),
  },
  {
    name: "Job listing",
    expected: "job",
    data: fixture({
      url: "https://jobs.example.test/jobs/research-engineer",
      title: "Research Engineer",
      paragraphs: ["Qualifications include Python and machine learning skills. Apply now."],
      schemaTypes: ["JobPosting"],
      signals: { hasJobPosting: true, hasApplyAction: true },
    }),
  },
  {
    name: "Greenhouse open-roles listing",
    expected: "job",
    data: fixture({
      url: "https://job-boards.greenhouse.io/anthropic",
      title: "Jobs at Anthropic",
      headings: ["Open Roles", "AI Research & Engineering"],
      links: [
        { text: "Research Engineer, Alignment", url: "https://job-boards.greenhouse.io/anthropic/jobs/5183044008", kind: "navigation", external: false },
        { text: "Applied Scientist", url: "https://job-boards.greenhouse.io/anthropic/jobs/5183051008", kind: "navigation", external: false },
        { text: "Engineering Manager", url: "https://job-boards.greenhouse.io/anthropic/jobs/5183053008", kind: "navigation", external: false },
      ],
    }),
  },
  {
    name: "Apple product page",
    expected: "shopping",
    data: fixture({
      url: "https://www.apple.com/iphone-18-pro/",
      title: "iPhone 18 Pro - Apple",
      headings: ["Get the highlights", "Camera", "Battery"],
      paragraphs: ["48MP Fusion camera and up to 45 hours video playback."],
      signals: { hasBuyAction: true },
    }),
  },
  {
    name: "Education course",
    expected: "education",
    data: fixture({
      url: "https://learn.example.test/courses/statistics",
      title: "Statistics course",
      schemaTypes: ["Course"],
    }),
  },
  {
    name: "Documentation page",
    expected: "documentation",
    data: fixture({
      url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
      title: "JavaScript",
      headings: ["JavaScript Guide", "Fundamental language guides", "JavaScript Reference"],
      signals: { hasCode: false },
    }),
  },
  {
    name: "Company services page",
    expected: "company",
    data: fixture({
      url: "https://example.test/services",
      title: "Our services",
      description: "Solutions for organizations.",
      schemaTypes: ["Organization"],
    }),
  },
  {
    name: "Forum question",
    expected: "forum",
    data: fixture({
      url: "https://forum.example.test/questions/42",
      title: "How do I solve this question?",
      schemaTypes: ["QAPage"],
    }),
  },
  {
    name: "Insufficient evidence stays general",
    expected: "general",
    data: fixture({ title: "A page" }),
  },
];

for (const testCase of cases) {
  const result = classify(testCase.data);
  assert.equal(result.type, testCase.expected, `${testCase.name}: got ${result.label}`);
}

const jairAnalysis = analyze(cases[0].data);
assert.equal(jairAnalysis.linkGroups.publications.length, 2);
assert.equal(jairAnalysis.linkGroups.external.length, 0);
assert.ok(jairAnalysis.classification.evidence.length > 0);
assert.ok(jairAnalysis.topics.some((topic) => topic.label === "artificial intelligence"));
assert.ok(jairAnalysis.topics.every((topic) => topic.label.split(" ").length >= 2));
const linkInsight = jairAnalysis.keyInsights.find((finding) => finding.title === "Link distribution");
assert.match(linkInsight.text, /2 links extracted: 2 internal and 0 external/);
assert.doesNotMatch(linkInsight.text, /2 publication\/article links/);
const jobListingAnalysis = analyze(cases.find((testCase) => testCase.name === "Greenhouse open-roles listing").data);
assert.ok(jobListingAnalysis.specific.some((finding) => finding.title === "Available roles"));

const evidencePage = fixture({
  title: "A grounded page",
  description: "A direct description from the page.",
  headings: ["Findings"],
  paragraphs: ["The extracted paragraph supports this finding."],
});
const analysis = analyze(evidencePage);
assert.ok(analysis.overview.evidence[0].text.includes("direct description"));
assert.equal(analysis.overview.evidence[0].url, evidencePage.metadata.url);
assert.equal(analysis.keyInsights[0].mode, "direct");

const numberPage = fixture({
  paragraphs: [
    "The product costs $49.99 and received 4.5 out of 5 stars from 120 reviews in 2024.",
    "A 2.5 cm screen has a 15% discount.",
  ],
});
const extractedNumbers = analyze(numberPage).numbers;
assert.ok(extractedNumbers.some((item) => item.type === "price" && item.context.includes("$49.99")));
assert.ok(extractedNumbers.some((item) => item.type === "rating"));
assert.ok(extractedNumbers.some((item) => item.type === "percentage"));
assert.ok(extractedNumbers.some((item) => item.type === "measurement"));
assert.ok(!extractedNumbers.some((item) => item.type === "year" && item.value === "2024"));

const oneOffEntity = analyze(fixture({
  paragraphs: ["Acme Observatory released a new instrument for researchers."],
}));
assert.ok(!oneOffEntity.entities.some((entity) => entity.name === "Acme Observatory"));

const repeatedEntity = analyze(fixture({
  paragraphs: [
    "Acme Observatory released a new instrument for researchers.",
    "Acme Observatory will publish the instrument specifications next month.",
  ],
}));
assert.ok(repeatedEntity.entities.some(
  (entity) => entity.name === "Acme Observatory" && entity.kind.includes("heuristic"),
));

console.log(`Passed ${cases.length} PageScope classification fixtures and analysis checks.`);
