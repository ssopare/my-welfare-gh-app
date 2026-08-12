import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

/// The mobile equivalent of the admin console's MoneyDisplay — value is
/// always the API's numeric *string*, never parsed to a JS/Dart double
/// before this is the one place formatting happens, same "never a raw
/// float in transit" reasoning.
class MoneyText extends StatelessWidget {
  const MoneyText({
    required this.value,
    this.currency = 'GHS',
    this.style,
    super.key,
  });

  final String value;
  final String currency;
  final TextStyle? style;

  static final _format = NumberFormat.currency(locale: 'en_GH', symbol: '', decimalDigits: 2);

  @override
  Widget build(BuildContext context) {
    final amount = double.tryParse(value) ?? 0;
    final symbol = currency == 'GHS' ? 'GH₵' : '$currency ';
    return Text(
      '$symbol${_format.format(amount.abs())}',
      style: (style ?? const TextStyle()).copyWith(
        fontFeatures: const [FontFeature.tabularFigures()],
        fontWeight: style?.fontWeight ?? FontWeight.w600,
      ),
    );
  }
}
