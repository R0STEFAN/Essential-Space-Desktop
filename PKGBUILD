# Maintainer: R0STEFAN
pkgname=essential-space-desktop-bin
pkgver=1.0.8
pkgrel=1
pkgdesc="Essential Space Desktop Native Companion for Nothing OS"
arch=('x86_64')
url="https://github.com/R0STEFAN/Essential-Space-Desktop"
license=('MIT')
depends=('webkit2gtk-4.1' 'gtk3' 'openssl')
provides=('essential-space-desktop')
conflicts=('essential-space-desktop')
source=("https://github.com/R0STEFAN/Essential-Space-Desktop/releases/download/v${pkgver}/Essential.Space_v${pkgver}_linux_x86_64.tar.gz")
sha256sums=('SKIP')

package() {
    install -Dm755 "${srcdir}/essential-space-desktop" "${pkgdir}/usr/bin/essential-space-desktop"
    if [ -f "${srcdir}/icons/128x128.png" ]; then
        install -Dm644 "${srcdir}/icons/128x128.png" "${pkgdir}/usr/share/icons/hicolor/128x128/apps/com.nothing.essentialspace.desktop.png"
    fi
    if [ -f "${srcdir}/icons/32x32.png" ]; then
        install -Dm644 "${srcdir}/icons/32x32.png" "${pkgdir}/usr/share/icons/hicolor/32x32/apps/com.nothing.essentialspace.desktop.png"
    fi

    install -d "${pkgdir}/usr/share/applications"
    cat << 'EOF' > "${pkgdir}/usr/share/applications/com.nothing.essentialspace.desktop.desktop"
[Desktop Entry]
Name=Essential Space
Comment=Nothing OS Desktop Companion
Exec=/usr/bin/essential-space-desktop
Icon=com.nothing.essentialspace.desktop
Terminal=false
Type=Application
Categories=Utility;Office;
EOF
}
