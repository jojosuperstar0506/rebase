"""Report generator for the diagnostics service."""


class ReportGenerator:
    """Generates HTML diagnostic reports from analysis results and intake data.

    Uses Jinja2 templates to render a complete diagnostic report
    combining metrics, insights, and company context."""

    def generate(self, engagement_id: str, analysis_result: dict, intake_data: dict) -> str:
        """Generate an HTML diagnostic report.

        Args:
            engagement_id: Unique engagement identifier.
            analysis_result: Full analysis output (metrics + insights).
            intake_data: Original intake data (intake_output.json schema).

        Returns:
            Rendered HTML string of the diagnostic report.
        """
        raise NotImplementedError
