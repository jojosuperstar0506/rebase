"""Document classifier for the diagnostics analysis engine."""


class DocumentClassifier:
    """Classifies uploaded documents by type (e.g., financial report,
    org chart, process doc, HR policy) to route them to the appropriate
    extraction pipeline."""

    def classify(self, file_path: str) -> str:
        """Classify a document and return its type identifier.

        Args:
            file_path: Path to the uploaded document.

        Returns:
            Document type string (e.g., "financial_report", "org_chart",
            "process_document", "hr_policy").
        """
        raise NotImplementedError
