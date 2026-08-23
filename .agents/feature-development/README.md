# Feature Development Guidelines

When adding new recovery actions, policy rules, or AI intelligence providers:
1. Register the action in `models.py` `RecoveryAction` enum.
2. Add corresponding validation rule in `policy/rules.py`.
3. Add executor handling in `agents/recovery_executor.py`.
4. Update UI components in `frontend/src/` to support new action visualization.
5. Add unit tests in `tests/test_pipeline.py`.
