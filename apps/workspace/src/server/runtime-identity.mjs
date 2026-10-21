export function readBackendIdentity(headers) {
  return {
    role: headers.get("x-woodright-runtime-role"),
    databaseAlias: headers.get("x-woodright-database-identity"),
    backendRevision: headers.get("x-woodright-backend-source-sha"),
  };
}
export function identityMatches(identity, env = process.env) {
  return Boolean(
    env.WOODRIGHT_DATA_ENVIRONMENT &&
    env.WOODRIGHT_EXPECTED_DATABASE_IDENTITY &&
    env.WOODRIGHT_EXPECTED_BACKEND_REVISION &&
    identity?.role === env.WOODRIGHT_DATA_ENVIRONMENT &&
    identity.databaseAlias === env.WOODRIGHT_EXPECTED_DATABASE_IDENTITY &&
    identity.backendRevision === env.WOODRIGHT_EXPECTED_BACKEND_REVISION,
  );
}
