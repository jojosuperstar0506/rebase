"""Field extractor for the diagnostics analysis engine."""


class FieldExtractor:
    """Extracts structured fields from classified documents.

    Uses document type to determine which fields to look for and how
    to parse them from the source file."""

    def extract(self, file_path: str, doc_type: str) -> dict:
        """Extract structured data from a document.

        Args:
            file_path: Path to the uploaded document.
            doc_type: Document type returned by DocumentClassifier.

        Returns:
            Dictionary of extracted fields specific to the document type.
        """
        raise NotImplementedError
