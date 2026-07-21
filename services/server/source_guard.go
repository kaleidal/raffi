package main

import (
	"fmt"
	"net"
	"net/url"
	"strings"

	"raffi-server/src/session"
)

func validateSessionSource(source string, kind session.SessionKind) error {
	source = strings.TrimSpace(source)
	if source == "" {
		return fmt.Errorf("source is required")
	}

	lower := strings.ToLower(source)
	if strings.HasPrefix(lower, "file:") {
		return fmt.Errorf("file: sources are not allowed")
	}

	if scheme, rest, ok := strings.Cut(source, "://"); ok {
		scheme = strings.ToLower(scheme)
		switch scheme {
		case "http", "https":
			return validateHTTPSource(scheme + "://" + rest)
		case "magnet":
			if kind != session.SessionKindTorrent && kind != "" {
				// magnet is only meaningful for torrents; still accept when kind omitted.
			}
			return nil
		default:
			return fmt.Errorf("unsupported source scheme: %s", scheme)
		}
	}

	if strings.HasPrefix(lower, "magnet:") {
		return nil
	}

	// Absolute/local filesystem paths (local library) — no scheme.
	if kind == session.SessionKindTorrent {
		return fmt.Errorf("torrent sources must be magnet: or http(s)")
	}
	if strings.Contains(source, "://") {
		return fmt.Errorf("unsupported source")
	}
	return nil
}

func validateHTTPSource(raw string) error {
	parsed, err := url.Parse(raw)
	if err != nil {
		return fmt.Errorf("invalid source URL")
	}
	host := parsed.Hostname()
	if host == "" {
		return fmt.Errorf("invalid source host")
	}

	lowerHost := strings.ToLower(host)
	if lowerHost == "metadata.google.internal" ||
		lowerHost == "metadata" ||
		strings.HasSuffix(lowerHost, ".metadata.google.internal") {
		return fmt.Errorf("blocked source host")
	}

	if ip := net.ParseIP(host); ip != nil {
		if isBlockedIP(ip) {
			return fmt.Errorf("blocked source address")
		}
	}
	return nil
}

func isBlockedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip4 := ip.To4(); ip4 != nil {
		// Link-local 169.254.0.0/16 (includes cloud metadata 169.254.169.254)
		if ip4[0] == 169 && ip4[1] == 254 {
			return true
		}
		// Current network / this host
		if ip4[0] == 0 {
			return true
		}
		return false
	}
	// IPv6 link-local fe80::/10
	if ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() {
		return true
	}
	return false
}
