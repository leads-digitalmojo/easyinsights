Feature Implementation Notes
============================

This document summarizes newly added minimal features:

- Members APIs and a basic Members UI tab under workspace Settings.
- Webhook payload persistence under `workhook_payloads` subcollection with attempt counts and status.
- Audit log writes on workspace creation and member changes under `audit_logs` subcollection.

These are intentionally additive and conservative to preserve all existing behaviour.
