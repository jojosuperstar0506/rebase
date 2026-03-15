"""ROI projection and comparison for customer engagements."""

from __future__ import annotations

from shared.schemas import ROIProjection


class ROICalculator:
    """Projects and compares ROI for automation engagements.

    Takes intake-assessment data (manual hours, error rates, costs)
    and produces an ROIProjection showing expected savings.
    """

    def project(self, engagement_id: str, intake_data: dict) -> ROIProjection:
        """Generate an ROI projection from intake assessment data.

        Args:
            engagement_id: Engagement identifier.
            intake_data: Dictionary with manual hours, costs, error rates.

        Returns:
            An ROIProjection with savings estimates.
        """
        raise NotImplementedError

    def compare(self, engagement_id: str) -> dict:
        """Compare projected vs. actual ROI for a running engagement.

        Args:
            engagement_id: Engagement identifier.

        Returns:
            Dictionary with projected, actual, and variance data.
        """
        raise NotImplementedError
