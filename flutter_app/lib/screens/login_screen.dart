import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/app_provider.dart';
import '../theme/app_theme.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  bool _isRegister = false;
  final _nameCtrl  = TextEditingController();
  final _emailCtrl = TextEditingController(text: '');
  final _passCtrl  = TextEditingController();
  bool _obscure = true;
  String? _errorMsg;
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _nameCtrl.dispose();
    _emailCtrl.dispose();
    _passCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _errorMsg = null);
    final auth = context.read<AuthProvider>();
    final err = _isRegister
        ? await auth.register(_nameCtrl.text.trim(), _emailCtrl.text.trim(), _passCtrl.text)
        : await auth.login(_emailCtrl.text.trim(), _passCtrl.text);
    if (err != null && mounted) setState(() => _errorMsg = err);
  }

  @override
  Widget build(BuildContext context) {
    final ext = context.appColors;
    final loading = context.watch<AuthProvider>().loading;

    return Scaffold(
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 32),
                // Logo
                Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        gradient: const LinearGradient(
                          colors: [AppColors.teal, AppColors.green],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                        borderRadius: BorderRadius.circular(12),
                      ),
                      alignment: Alignment.center,
                      child: const Text('AT',
                          style: TextStyle(
                              color: Colors.white,
                              fontSize: 16,
                              fontWeight: FontWeight.w900)),
                    ),
                    const SizedBox(width: 12),
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text.rich(TextSpan(children: [
                          TextSpan(
                              text: 'Abhi',
                              style: TextStyle(
                                  color: ext.textPrimary,
                                  fontSize: 22,
                                  fontWeight: FontWeight.w900)),
                          const TextSpan(
                              text: 'Trade',
                              style: TextStyle(
                                  color: AppColors.teal,
                                  fontSize: 22,
                                  fontWeight: FontWeight.w900)),
                        ])),
                        Text('Trade Smart. Invest Better.',
                            style: TextStyle(
                                color: ext.textMuted, fontSize: 12)),
                      ],
                    ),
                  ],
                ),
                const SizedBox(height: 48),
                Text(
                  _isRegister ? 'Create Account' : 'Welcome Back',
                  style: TextStyle(
                      color: ext.textPrimary,
                      fontSize: 28,
                      fontWeight: FontWeight.w800),
                ),
                const SizedBox(height: 4),
                Text(
                  _isRegister
                      ? 'Sign up to start your trading journey'
                      : 'Sign in to your AbhiTrade account',
                  style: TextStyle(color: ext.textSecondary, fontSize: 15),
                ),
                const SizedBox(height: 32),
                if (_isRegister) ...[
                  TextFormField(
                    controller: _nameCtrl,
                    decoration: const InputDecoration(
                      labelText: 'Full Name',
                      prefixIcon: Icon(Icons.person_outline),
                    ),
                    validator: (v) =>
                        v == null || v.trim().isEmpty ? 'Name is required' : null,
                  ),
                  const SizedBox(height: 16),
                ],
                TextFormField(
                  controller: _emailCtrl,
                  keyboardType: TextInputType.emailAddress,
                  decoration: const InputDecoration(
                    labelText: 'Email Address',
                    prefixIcon: Icon(Icons.email_outlined),
                  ),
                  validator: (v) =>
                      v == null || !v.contains('@') ? 'Enter a valid email' : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _passCtrl,
                  obscureText: _obscure,
                  decoration: InputDecoration(
                    labelText: 'Password',
                    prefixIcon: const Icon(Icons.lock_outline),
                    suffixIcon: IconButton(
                      icon: Icon(
                          _obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    ),
                  ),
                  validator: (v) =>
                      v == null || v.length < 6 ? 'Min 6 characters' : null,
                ),
                if (_errorMsg != null) ...[
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.redDim,
                      borderRadius: BorderRadius.circular(8),
                      border: Border.all(color: AppColors.red.withOpacity(0.3)),
                    ),
                    child: Row(
                      children: [
                        const Icon(Icons.error_outline, color: AppColors.red, size: 18),
                        const SizedBox(width: 8),
                        Expanded(
                            child: Text(_errorMsg!,
                                style: const TextStyle(color: AppColors.red, fontSize: 13))),
                      ],
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: loading ? null : _submit,
                    child: loading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                                color: Colors.white, strokeWidth: 2))
                        : Text(_isRegister ? 'Create Account' : 'Sign In'),
                  ),
                ),
                const SizedBox(height: 16),
                Center(
                  child: TextButton(
                    onPressed: () => setState(() {
                      _isRegister = !_isRegister;
                      _errorMsg = null;
                    }),
                    child: Text.rich(TextSpan(children: [
                      TextSpan(
                          text: _isRegister
                              ? 'Already have an account? '
                              : "Don't have an account? ",
                          style:
                              TextStyle(color: ext.textSecondary, fontSize: 14)),
                      TextSpan(
                          text: _isRegister ? 'Sign In' : 'Sign Up',
                          style: const TextStyle(
                              color: AppColors.blue,
                              fontSize: 14,
                              fontWeight: FontWeight.w600)),
                    ])),
                  ),
                ),
                const SizedBox(height: 32),
                // Demo note
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: ext.card,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: ext.border),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.info_outline,
                          color: AppColors.blue, size: 16),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          'Connects to abhitrade.online — start with paper trading to practice risk-free.',
                          style: TextStyle(
                              color: ext.textSecondary, fontSize: 12),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
