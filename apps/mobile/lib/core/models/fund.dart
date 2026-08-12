/// GET /funds — narrowed to what the payment picker needs. Member-readable
/// (no admin gate on this endpoint, same as active contribution/benefit
/// rules) since a member needs to know which fund they're paying into.
class Fund {
  const Fund({required this.id, required this.name});

  factory Fund.fromJson(Map<String, dynamic> json) => Fund(
        id: json['id'] as String,
        name: json['name'] as String,
      );

  final String id;
  final String name;
}
