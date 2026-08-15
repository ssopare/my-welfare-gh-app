/// Mirrors packages/shared-types' MyOrganisationMembership exactly — one
/// entry per organisation the current account belongs to, as returned by
/// GET /auth/organisations. Same hand-written-not-generated reasoning as
/// AuthIdentity.
class MyOrganisationMembership {
  const MyOrganisationMembership({
    required this.organisationId,
    required this.legalName,
    required this.role,
    required this.status,
    required this.isCurrent,
  });

  factory MyOrganisationMembership.fromJson(Map<String, dynamic> json) => MyOrganisationMembership(
        organisationId: json['organisationId'] as String,
        legalName: json['legalName'] as String,
        role: json['role'] as String,
        status: json['status'] as String,
        isCurrent: json['isCurrent'] as bool,
      );

  final String organisationId;
  final String legalName;
  final String role; // "ADMIN" | "MEMBER"
  final String status;
  final bool isCurrent;
}
