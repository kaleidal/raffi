package hls

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const cometPlaybackHost = "comet.elfhosted.com"

// resolvePlaybackSource turns Comet's IP-bound playback endpoint into the
// concrete media URL before ffprobe or ffmpeg sees it. Electron and ffmpeg can
// otherwise choose different address families, causing Comet to return its
// short "Wrong IP" HLS slate instead of the requested video.
func ResolvePlaybackSource(ctx context.Context, source string) (string, error) {
	parsed, err := url.Parse(source)
	if err != nil || !strings.EqualFold(parsed.Hostname(), cometPlaybackHost) || !strings.HasPrefix(parsed.Path, "/playback/") {
		return source, nil
	}

	lookupCtx, cancelLookup := context.WithTimeout(ctx, 5*time.Second)
	addresses, err := net.DefaultResolver.LookupIPAddr(lookupCtx, parsed.Hostname())
	cancelLookup()
	if err != nil {
		return "", fmt.Errorf("could not resolve stream provider address: %w", err)
	}
	addresses = preferredCometAddresses(addresses)
	if len(addresses) == 0 {
		return "", fmt.Errorf("stream provider has no reachable IPv4 or IPv6 address")
	}

	var sawWrongIP bool
	var lastErr error
	for _, address := range addresses {
		resolved, wrongIP, err := resolveCometPlaybackSource(ctx, source, address)
		if err == nil && resolved != "" {
			return resolved, nil
		}
		if wrongIP {
			sawWrongIP = true
		}
		if err != nil {
			lastErr = err
		}
	}

	if sawWrongIP {
		return "", fmt.Errorf("stream provider rejected this connection because its IP address changed")
	}
	if lastErr != nil {
		return "", fmt.Errorf("could not resolve stream provider playback URL: %w", lastErr)
	}
	return "", fmt.Errorf("stream provider did not return a playable media URL")
}

func preferredCometAddresses(addresses []net.IPAddr) []net.IPAddr {
	var ipv6 *net.IPAddr
	var ipv4 *net.IPAddr
	for i := range addresses {
		address := addresses[i]
		if address.IP.To4() == nil {
			if ipv6 == nil {
				ipv6 = &address
			}
		} else if ipv4 == nil {
			ipv4 = &address
		}
	}
	preferred := make([]net.IPAddr, 0, 2)
	if ipv6 != nil {
		preferred = append(preferred, *ipv6)
	}
	if ipv4 != nil {
		preferred = append(preferred, *ipv4)
	}
	return preferred
}

func resolveCometPlaybackSource(ctx context.Context, source string, target net.IPAddr) (string, bool, error) {
	network := "tcp6"
	if target.IP.To4() != nil {
		network = "tcp4"
	}
	dialer := &net.Dialer{Timeout: 8 * time.Second, KeepAlive: 30 * time.Second}
	transport := &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: func(ctx context.Context, _, address string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(address)
			if err != nil || !strings.EqualFold(host, cometPlaybackHost) {
				return dialer.DialContext(ctx, network, address)
			}
			targetHost := target.IP.String()
			if target.Zone != "" {
				targetHost += "%" + target.Zone
			}
			return dialer.DialContext(ctx, network, net.JoinHostPort(targetHost, port))
		},
		ForceAttemptHTTP2: true,
	}
	defer transport.CloseIdleConnections()

	client := &http.Client{
		Transport: transport,
		Timeout:   10 * time.Second,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, source, nil)
	if err != nil {
		return "", false, err
	}
	req.Header.Set("Range", "bytes=0-0")

	resp, err := client.Do(req)
	if err != nil {
		return "", false, err
	}
	defer resp.Body.Close()

	location := resp.Header.Get("Location")
	if location == "" {
		return "", false, fmt.Errorf("unexpected HTTP status %s", resp.Status)
	}
	redirect, err := req.URL.Parse(location)
	if err != nil {
		return "", false, fmt.Errorf("invalid playback redirect: %w", err)
	}
	redirectURL := redirect.String()
	if isCometErrorSlate(redirectURL) {
		return "", true, nil
	}
	return redirectURL, false, nil
}

func isCometErrorSlate(location string) bool {
	lower := strings.ToLower(location)
	return strings.Contains(lower, "slate.m3u8") || strings.Contains(lower, "wrong+ip")
}
