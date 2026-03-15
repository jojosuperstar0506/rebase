"""Insight generator for the diagnostics analysis engine."""


class InsightGenerator:
    """Generates actionable insights by combining computed metrics
    with intake context.

    Produces prioritized recommendations and narrative insights
    for the diagnostic report."""

    def generate(self, metrics: dict, intake_data: dict) -> list[str]:
        """Generate insights from metrics and intake data.

        Args:
            metrics: Computed metrics from MetricsCalculator.
            intake_data: Original intake data (intake_output.json schema).

        Returns:
            List of insight strings, ordered by priority/impact.
        """
        raise NotImplementedError
