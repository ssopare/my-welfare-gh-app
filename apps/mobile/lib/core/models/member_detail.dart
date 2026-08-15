import 'dependant.dart';
import 'member_status_change.dart';

/// The full GET /members/me shape — a separate, richer model from
/// MemberProfile (Home's own narrow view of the same endpoint), used only
/// by the Profile screen, which is the one place dependants/status
/// history actually get rendered. Same "each screen gets the model it
/// actually needs" precedent as the admin console's Member vs
/// MemberDetail distinction.
class MemberDetail {
  const MemberDetail({
    required this.id,
    required this.status,
    required this.category,
    required this.joinDate,
    required this.name,
    required this.phoneNumber,
    required this.chapterName,
    required this.dependants,
    required this.statusChanges,
    required this.avatarUrl,
  });

  factory MemberDetail.fromJson(Map<String, dynamic> json) {
    final account = json['account'] as Map<String, dynamic>;
    return MemberDetail(
      id: json['id'] as String,
      status: json['status'] as String,
      category: json['category'] as String,
      joinDate: DateTime.parse(json['joinDate'] as String),
      name: account['name'] as String?,
      phoneNumber: account['phoneNumber'] as String,
      chapterName: (json['chapter'] as Map<String, dynamic>?)?['name'] as String?,
      avatarUrl: account['avatarUrl'] as String?,
      dependants: (json['dependants'] as List)
          .map((e) => Dependant.fromJson(e as Map<String, dynamic>))
          .toList(),
      statusChanges: (json['statusChanges'] as List)
          .map((e) => MemberStatusChange.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }

  final String id;
  final String status;
  final String category;
  final DateTime joinDate;
  final String? name;
  final String phoneNumber;
  final String? chapterName;
  final List<Dependant> dependants;
  final List<MemberStatusChange> statusChanges;
  final String? avatarUrl;
}
