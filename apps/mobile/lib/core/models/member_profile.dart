/// GET /members/me's response — narrowed to what the home dashboard
/// actually renders (see the design plan's "populate incrementally as
/// actually consumed" principle already applied to packages/shared-types
/// on the admin side). Dependants/status-history detail belongs to a
/// later Profile screen, not here.
class MemberProfile {
  const MemberProfile({
    required this.id,
    required this.status,
    required this.category,
    required this.joinDate,
    required this.name,
    required this.phoneNumber,
    required this.chapterName,
    required this.dependantCount,
  });

  factory MemberProfile.fromJson(Map<String, dynamic> json) {
    final account = json['account'] as Map<String, dynamic>;
    return MemberProfile(
      id: json['id'] as String,
      status: json['status'] as String,
      category: json['category'] as String,
      joinDate: DateTime.parse(json['joinDate'] as String),
      name: account['name'] as String?,
      phoneNumber: account['phoneNumber'] as String,
      chapterName: (json['chapter'] as Map<String, dynamic>?)?['name'] as String?,
      dependantCount: (json['dependants'] as List?)?.length ?? 0,
    );
  }

  final String id;
  final String status;
  final String category;
  final DateTime joinDate;
  final String? name;
  final String phoneNumber;
  final String? chapterName;
  final int dependantCount;
}
