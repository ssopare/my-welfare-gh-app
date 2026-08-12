/// Mirrors apps/admin/src/lib/api-client.ts's ApiError — the message the
/// API actually sent back (class-validator's `message`, string or array),
/// not Dio's own generic "Http status error" text, so error states in the
/// UI read the same way they do in the admin console.
class ApiException implements Exception {
  ApiException(this.statusCode, this.message, {this.body});

  final int? statusCode;
  final String message;
  final Object? body;

  @override
  String toString() => message;
}
