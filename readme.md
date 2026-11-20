# PageScope

### Webpage Intelligence, Beyond Summarization.

PageScope is a local-first Chrome extension that extracts, organizes, classifies and analyzes information from webpages, transforming scattered website content into structured intelligence reports.

Instead of simply summarizing a webpage, PageScope examines its structure, identifies important information, detects relevant links and content, and presents its findings with traceable evidence.

## Overview

The web contains enormous amounts of information, but finding and organizing what actually matters can be time-consuming.

PageScope aims to make webpage exploration more efficient by automatically identifying what a webpage contains and presenting its information in a structured, understandable format.

Whether it's an academic journal, research paper, job listing, article or product page, PageScope is designed to adapt its analysis to the type of content being explored.

## Features

### Intelligent Webpage Classification
- Rule-based webpage classification.
- Weighted classification scoring.
- Classification confidence indicators.
- Evidence supporting classification decisions.
- Support for multiple webpage categories.

### Content Extraction
- Page titles and metadata.
- Headings and content hierarchy.
- Main textual content.
- Internal and external links.
- Images and alternative text.
- Tables and lists.

### Webpage Analysis
- Automated page overviews.
- Key insights and content analysis.
- Main topic identification.
- Featured content detection.
- Important entities and numerical findings.
- Page-specific analysis.

### Evidence and Source Traceability
- Source information associated with findings.
- Extracted content distinguished from rule-based interpretations.
- Original webpage references.
- Expandable evidence and source details.

### Structured Intelligence Reports
- Organized analysis sections.
- Expandable links and extracted data.
- Page-specific report sections.
- Extraction statistics.
- Reanalysis of the current webpage.

## Supported Page Categories

PageScope is being developed to recognize different types of webpages, including:

- Academic journals and research papers.
- Research repositories.
- News articles and blogs.
- Shopping and product pages.
- Jobs and internship listings.
- Educational and course pages.
- Technical documentation and tutorials.
- Company and service websites.
- General webpages.

Classification and analysis quality may vary depending on webpage structure and available content.

## Technology Stack

| Technology | Purpose |
|---|---|
| JavaScript | Core application logic |
| HTML5 | Interface structure |
| CSS3 | User interface and styling |
| Chrome Extension Manifest V3 | Browser integration |
| Chrome Side Panel API | Report interface |
| DOM APIs | Webpage content extraction |
| Chrome Extension APIs | Browser communication |

## Privacy and Architecture

PageScope follows a local-first approach.

- Webpage extraction happens within the browser.
- No paid AI APIs are required.
- No cloud backend is required for the current implementation.
- Extracted information is processed locally by deterministic rules.
- The current analysis does not rely on a remote AI model.

## Installation

PageScope is currently available as an unpacked Chrome extension.

1. Clone this repository:

   ```bash
   git clone https://github.com/YOUR_USERNAME/PageScope.git
   ```

2. Open Google Chrome.

3. Navigate to:

   ```text
   chrome://extensions/
   ```

4. Enable **Developer mode**.

5. Select **Load unpacked**.

6. Choose the cloned PageScope project folder.

7. Open a supported webpage and click the PageScope extension icon.

8. Select **Analyze current page** to generate an intelligence report.

## Project Roadmap

PageScope is actively being developed.

- [x] Chrome Extension foundation.
- [x] Webpage content extraction.
- [x] Metadata and structural extraction.
- [x] Rule-based webpage classification.
- [x] Structured intelligence reports.
- [x] Page-specific analysis.
- [x] Expandable links and extracted data.
- [x] Evidence-oriented reporting.
- [ ] Improved semantic topic and entity extraction.
- [ ] More robust main-content extraction.
- [ ] Local LLM integration.
- [ ] Retrieval-Augmented Generation (RAG).
- [ ] Ask This Page functionality.
- [ ] Semantic search across extracted content.
- [ ] Webpage comparison.
- [ ] Report export.

## Future Vision

The long-term goal is to evolve PageScope into a local-first webpage intelligence assistant.

Planned AI capabilities include:

- Local language model integration.
- Semantic content understanding.
- Embeddings and vector-based retrieval.
- Evidence-grounded question answering using RAG.
- Context-aware analysis of webpage content.
- Interactive exploration of extracted information.

The goal is to combine reliable deterministic extraction with local AI capabilities while maintaining transparency, privacy and source traceability.

## Project Status

**Current version:** 0.2

PageScope is an evolving project. Features and analysis capabilities are continuously being improved.

## License

This project is currently under development. Licensing details will be added when the repository license is finalized.