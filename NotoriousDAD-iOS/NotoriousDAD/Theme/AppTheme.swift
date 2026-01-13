import SwiftUI

// MARK: - Notorious DAD Theme System
// Electric Gold aesthetic with dark mode first design

struct AppTheme {

    // MARK: - Color Palette

    struct Colors {
        // Primary brand colors
        static let gold = Color(red: 1.0, green: 0.84, blue: 0.0)
        static let goldDeep = Color(red: 0.85, green: 0.65, blue: 0.13)
        static let goldDark = Color(red: 0.55, green: 0.41, blue: 0.08)

        // Background hierarchy (dark mode)
        static let background = Color(red: 0.06, green: 0.06, blue: 0.08)
        static let surface = Color(red: 0.10, green: 0.10, blue: 0.12)
        static let surfaceElevated = Color(red: 0.14, green: 0.14, blue: 0.16)
        static let surfaceHighlight = Color(red: 0.18, green: 0.18, blue: 0.20)

        // Text hierarchy
        static let textPrimary = Color.white
        static let textSecondary = Color(white: 0.65)
        static let textTertiary = Color(white: 0.45)

        // Semantic colors
        static let success = Color(red: 0.3, green: 0.85, blue: 0.4)
        static let error = Color(red: 1.0, green: 0.35, blue: 0.35)
        static let warning = Color(red: 1.0, green: 0.7, blue: 0.2)

        // Accent variants for variety
        static let accentCyan = Color(red: 0.2, green: 0.8, blue: 0.9)
        static let accentPink = Color(red: 1.0, green: 0.4, blue: 0.6)
        static let accentGreen = Color(red: 0.4, green: 0.9, blue: 0.5)
    }

    // MARK: - Typography

    struct Typography {
        static let largeTitle = Font.system(size: 34, weight: .bold, design: .rounded)
        static let title = Font.system(size: 28, weight: .bold, design: .rounded)
        static let title2 = Font.system(size: 22, weight: .semibold, design: .rounded)
        static let title3 = Font.system(size: 20, weight: .semibold, design: .rounded)
        static let headline = Font.system(size: 17, weight: .semibold, design: .rounded)
        static let body = Font.system(size: 17, weight: .regular, design: .default)
        static let callout = Font.system(size: 16, weight: .medium, design: .default)
        static let subheadline = Font.system(size: 15, weight: .regular, design: .default)
        static let footnote = Font.system(size: 13, weight: .regular, design: .default)
        static let caption = Font.system(size: 12, weight: .medium, design: .default)
        static let caption2 = Font.system(size: 11, weight: .regular, design: .default)
    }

    // MARK: - Spacing

    struct Spacing {
        static let xxs: CGFloat = 4
        static let xs: CGFloat = 8
        static let sm: CGFloat = 12
        static let md: CGFloat = 16
        static let lg: CGFloat = 24
        static let xl: CGFloat = 32
        static let xxl: CGFloat = 48
    }

    // MARK: - Corner Radius

    struct Radius {
        static let sm: CGFloat = 8
        static let md: CGFloat = 12
        static let lg: CGFloat = 16
        static let xl: CGFloat = 20
        static let full: CGFloat = 9999
    }

    // MARK: - Shadows

    struct Shadow {
        static let subtle = SwiftUI.Color.black.opacity(0.15)
        static let medium = SwiftUI.Color.black.opacity(0.25)
        static let strong = SwiftUI.Color.black.opacity(0.4)
    }

    // MARK: - Animation

    struct Animation {
        static let quick = SwiftUI.Animation.easeOut(duration: 0.15)
        static let standard = SwiftUI.Animation.easeInOut(duration: 0.25)
        static let smooth = SwiftUI.Animation.easeInOut(duration: 0.35)
        static let spring = SwiftUI.Animation.spring(response: 0.35, dampingFraction: 0.7)
    }
}

// MARK: - Reusable View Modifiers

struct GoldGradient: ViewModifier {
    func body(content: Content) -> some View {
        content
            .foregroundStyle(
                LinearGradient(
                    colors: [AppTheme.Colors.gold, AppTheme.Colors.goldDeep],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
    }
}

struct CardStyle: ViewModifier {
    var isElevated: Bool = false

    func body(content: Content) -> some View {
        content
            .padding(AppTheme.Spacing.md)
            .background(isElevated ? AppTheme.Colors.surfaceElevated : AppTheme.Colors.surface)
            .cornerRadius(AppTheme.Radius.lg)
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    var isDisabled: Bool = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppTheme.Typography.headline)
            .foregroundColor(isDisabled ? AppTheme.Colors.textTertiary : AppTheme.Colors.background)
            .frame(maxWidth: .infinity)
            .padding(.vertical, AppTheme.Spacing.md)
            .background(
                Group {
                    if isDisabled {
                        AppTheme.Colors.surfaceHighlight
                    } else {
                        LinearGradient(
                            colors: [AppTheme.Colors.gold, AppTheme.Colors.goldDeep],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    }
                }
            )
            .cornerRadius(AppTheme.Radius.md)
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(AppTheme.Animation.quick, value: configuration.isPressed)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(AppTheme.Typography.callout)
            .foregroundColor(AppTheme.Colors.gold)
            .padding(.horizontal, AppTheme.Spacing.md)
            .padding(.vertical, AppTheme.Spacing.sm)
            .background(AppTheme.Colors.gold.opacity(0.15))
            .cornerRadius(AppTheme.Radius.md)
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.Radius.md)
                    .stroke(AppTheme.Colors.gold.opacity(0.3), lineWidth: 1)
            )
            .scaleEffect(configuration.isPressed ? 0.97 : 1.0)
            .animation(AppTheme.Animation.quick, value: configuration.isPressed)
    }
}

// MARK: - View Extensions

extension View {
    func goldGradient() -> some View {
        modifier(GoldGradient())
    }

    func cardStyle(elevated: Bool = false) -> some View {
        modifier(CardStyle(isElevated: elevated))
    }

    func screenBackground() -> some View {
        self.background(AppTheme.Colors.background.ignoresSafeArea())
    }
}

// MARK: - Preview

#Preview {
    VStack(spacing: 20) {
        Text("Notorious DAD")
            .font(AppTheme.Typography.largeTitle)
            .goldGradient()

        Text("Secondary text")
            .font(AppTheme.Typography.body)
            .foregroundColor(AppTheme.Colors.textSecondary)

        Button("Generate Mix") {}
            .buttonStyle(PrimaryButtonStyle())
            .padding(.horizontal)

        Button("Settings") {}
            .buttonStyle(SecondaryButtonStyle())
    }
    .padding()
    .screenBackground()
}
