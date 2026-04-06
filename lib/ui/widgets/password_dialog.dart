import 'package:flutter/material.dart';

class PasswordDialog extends StatefulWidget {
  final String roomName;
  const PasswordDialog({super.key, required this.roomName});

  @override
  State<PasswordDialog> createState() => _PasswordDialogState();
}

class _PasswordDialogState extends State<PasswordDialog> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: Text(widget.roomName),
      content: TextField(
        controller: _controller,
        obscureText: true,
        decoration: const InputDecoration(
          labelText: '비밀번호',
          border: OutlineInputBorder(),
        ),
        maxLength: 20,
        autofocus: true,
        onSubmitted: (_) => _submit(),
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('취소')),
        ElevatedButton(onPressed: _submit, child: const Text('입장')),
      ],
    );
  }

  void _submit() {
    final pw = _controller.text.trim();
    if (pw.isNotEmpty) Navigator.pop(context, pw);
  }
}
