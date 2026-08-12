/// The decoded JWT payload, as returned by GET /auth/me — mirrors
/// packages/shared-types' AuthIdentity exactly. Hand-written, not
/// generated, same reasoning as the admin console's shared-types package:
/// a real backend shape change becomes a compile error here, not a silent
/// runtime surprise.
class AuthIdentity {
  const AuthIdentity({
    required this.sub,
    required this.memberId,
    required this.organisationId,
    required this.role,
  });

  factory AuthIdentity.fromJson(Map<String, dynamic> json) => AuthIdentity(
        sub: json['sub'] as String,
        memberId: json['memberId'] as String,
        organisationId: json['organisationId'] as String,
        role: json['role'] as String,
      );

  final String sub;
  final String memberId;
  final String organisationId;
  final String role; // "ADMIN" | "MEMBER"

  bool get isAdmin => role == 'ADMIN';
}
