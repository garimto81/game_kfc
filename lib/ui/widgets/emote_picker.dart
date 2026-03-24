import 'package:flutter/material.dart';

/// Available emoticon IDs (matching assets/emoticons/ filenames)
const List<String> kEmoteIds = [
  '1', '10', '1001', '1002', '1003', '1004', '1005',
  '1006', '1007', '1008', '1009', '1010', '1011', '1012',
  '1013', '1014', '1015', '1016', '1017', '1018', '1019',
  '1020', '1021', '1022', '1023',
];

class EmotePicker extends StatelessWidget {
  final void Function(String emoteId) onEmoteSelected;

  const EmotePicker({super.key, required this.onEmoteSelected});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(
        color: Colors.grey[900]?.withValues(alpha: 0.95),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white24),
        boxShadow: const [
          BoxShadow(color: Colors.black54, blurRadius: 12, offset: Offset(0, 4)),
        ],
      ),
      child: SizedBox(
        width: 250,
        height: 250,
        child: GridView.builder(
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 5,
            mainAxisSpacing: 4,
            crossAxisSpacing: 4,
          ),
          itemCount: kEmoteIds.length,
          itemBuilder: (context, index) {
            final emoteId = kEmoteIds[index];
            return GestureDetector(
              onTap: () => onEmoteSelected(emoteId),
              child: Container(
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(8),
                  color: Colors.white10,
                ),
                padding: const EdgeInsets.all(4),
                child: Image.asset(
                  'assets/emoticons/$emoteId.png',
                  fit: BoxFit.contain,
                  errorBuilder: (_, __, ___) => const Icon(
                    Icons.emoji_emotions,
                    color: Colors.white54,
                    size: 24,
                  ),
                ),
              ),
            );
          },
        ),
      ),
    );
  }
}
