-- Finalize the audit privilege boundary after code uses append_audit_event.
--
-- PUBLIC execute closes in this migration. Immediately run
-- `npm run audit:provision` to grant the named runtime login membership in
-- echo_maze_runtime and prove the final negative privileges transactionally.

ALTER TABLE audit_events OWNER TO echo_maze_audit_owner;
ALTER SEQUENCE audit_events_id_seq OWNER TO echo_maze_audit_owner;
ALTER TABLE audit_chain_head OWNER TO echo_maze_audit_owner;
ALTER FUNCTION audit_events_append_only() OWNER TO echo_maze_audit_owner;

REVOKE CREATE ON SCHEMA public FROM echo_maze_audit_owner;
GRANT USAGE ON SCHEMA public TO echo_maze_audit_owner;

REVOKE ALL ON TABLE audit_events FROM PUBLIC;
REVOKE ALL ON TABLE audit_chain_head FROM PUBLIC;
REVOKE ALL ON SEQUENCE audit_events_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION audit_events_append_only() FROM PUBLIC;
REVOKE ALL ON FUNCTION canonical_audit_json(JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION append_audit_event(TEXT) FROM PUBLIC;

REVOKE ALL ON TABLE audit_events FROM echo_maze_runtime;
REVOKE ALL ON TABLE audit_chain_head FROM echo_maze_runtime;
REVOKE ALL ON SEQUENCE audit_events_id_seq FROM echo_maze_runtime;
REVOKE ALL ON FUNCTION canonical_audit_json(JSONB) FROM echo_maze_runtime;
GRANT USAGE ON SCHEMA public TO echo_maze_runtime;
GRANT SELECT ON TABLE audit_events TO echo_maze_runtime;
GRANT SELECT ON TABLE audit_chain_head TO echo_maze_runtime;
GRANT EXECUTE ON FUNCTION append_audit_event(TEXT) TO echo_maze_runtime;
