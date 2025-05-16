export class AuthError extends Error {
  constructor(message?: string) {
    super(message);
    this.name = "AuthError";
  }
}

export class UnauthenticatedError extends AuthError {
  constructor(message?: string) {
    super(message);
    this.name = "UnauthenticatedError";
  }
}

export class ExpiredJwtError extends AuthError {
  constructor() {
    super('Expired JWT');
    this.name = "ExpiredJwtError";
  }
}

export class UnauthorizedError extends AuthError {
  constructor(message?: string) {
    super(message);
    this.name = "UnauthorizedError";
  }
}
