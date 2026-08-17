import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'profile_repository.dart';

/// Same AlertDialog/TextEditingController/dispose shape as
/// ProfileScreen._editName — not a new dialog convention.
Future<void> showAddDependantDialog(BuildContext context, WidgetRef ref) async {
  final nameController = TextEditingController();
  final relationshipController = TextEditingController();

  final result = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: const Text('Add dependant'),
      content: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          TextField(
            controller: nameController,
            autofocus: true,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Full name', hintText: 'e.g. Ama Mensah'),
          ),
          const SizedBox(height: 12),
          TextField(
            controller: relationshipController,
            textCapitalization: TextCapitalization.words,
            decoration: const InputDecoration(labelText: 'Relationship', hintText: 'e.g. Daughter, Spouse'),
          ),
        ],
      ),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(false), child: const Text('Cancel')),
        FilledButton(onPressed: () => Navigator.of(context).pop(true), child: const Text('Save')),
      ],
    ),
  );

  final name = nameController.text.trim();
  final relationship = relationshipController.text.trim();
  nameController.dispose();
  relationshipController.dispose();

  if (result != true || name.isEmpty || relationship.isEmpty) return;

  try {
    await ref.read(profileRepositoryProvider).addDependant(name, relationship);
    ref.invalidate(profileDataProvider);
  } catch (e) {
    if (context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not add dependant: $e')),
      );
    }
  }
}
