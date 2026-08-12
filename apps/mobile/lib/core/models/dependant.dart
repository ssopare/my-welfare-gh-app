class Dependant {
  const Dependant({
    required this.id,
    required this.relationship,
    required this.name,
    required this.confirmed,
  });

  factory Dependant.fromJson(Map<String, dynamic> json) => Dependant(
        id: json['id'] as String,
        relationship: json['relationship'] as String,
        name: json['name'] as String,
        confirmed: json['confirmed'] as bool,
      );

  final String id;
  final String relationship;
  final String name;
  final bool confirmed;
}
