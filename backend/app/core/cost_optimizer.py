
from ..models import RecoveryAction

# Action execution cost in INR
ACTION_COST_MAP: dict[str, float] = {
    RecoveryAction.RETRY.value: 2.00,
    RecoveryAction.DELAYED_RETRY.value: 2.50,
    RecoveryAction.ALTERNATE_METHOD.value: 4.00,
    RecoveryAction.PAYMENT_LINK.value: 5.00,
    RecoveryAction.HUMAN_REVIEW.value: 45.00,
    RecoveryAction.STOP.value: 0.00
}

class CostOptimizer:
    ACTION_COSTS = ACTION_COST_MAP

    @staticmethod
    def get_action_cost(action: str) -> float:
        return ACTION_COST_MAP.get(action, 5.00)

    @staticmethod
    def calculate_expected_net_recovery(amount: float, recovery_probability: float, action: str) -> float:
        """
        Expected Net Recovery = (Recovery Probability * Amount) - Action Cost
        """
        cost = CostOptimizer.get_action_cost(action)
        expected = (recovery_probability * amount) - cost
        return round(max(0.0, expected), 2)
