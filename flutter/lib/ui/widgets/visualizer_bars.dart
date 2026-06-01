import 'package:flutter/material.dart';

class VisualizerBars extends StatelessWidget {
  final List<double> volumes;
  final bool isLeft;
  final double maxHeight;

  const VisualizerBars({
    super.key,
    required this.volumes,
    this.isLeft = false,
    this.maxHeight = 32.0,
  });

  @override
  Widget build(BuildContext context) {
    final List<double> bars = isLeft ? volumes.reversed.toList() : volumes;
    
    return SizedBox(
      height: maxHeight,
      child: Row(
        mainAxisAlignment: isLeft ? MainAxisAlignment.end : MainAxisAlignment.start,
        children: bars.map((v) {
          // Limit height to maxHeight as requested by the user
          final double h = (v * maxHeight * 1.5).clamp(4.0, maxHeight);
          
          return AnimatedContainer(
            duration: const Duration(milliseconds: 100),
            curve: Curves.easeOutCubic,
            margin: const EdgeInsets.symmetric(horizontal: 2),
            width: 2,
            height: h,
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              gradient: const LinearGradient(
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
                colors: [Color(0xFFA3D944), Color(0xFF29ABE2)],
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
