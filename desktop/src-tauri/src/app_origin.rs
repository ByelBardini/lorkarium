use std::fmt;

use url::Url;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BuildProfile {
    Debug,
    Release,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppOrigin {
    url: Url,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppOriginError {
    message: String,
}

impl fmt::Display for AppOriginError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for AppOriginError {}

fn refusal(raw: &str, expected: &str) -> AppOriginError {
    AppOriginError {
        message: format!("LORKARIUM_APP_URL inválida: {raw:?}; {expected}"),
    }
}

fn has_credentials(url: &Url) -> bool {
    !url.username().is_empty() || url.password().is_some()
}

impl AppOrigin {
    /// The site the shell opens, reduced to `scheme://host[:port]`; release builds only take https.
    ///
    /// Example: `AppOrigin::parse("https://lorkarium.app", BuildProfile::Release)`
    pub fn parse(raw: &str, build: BuildProfile) -> Result<Self, AppOriginError> {
        let url =
            Url::parse(raw).map_err(|cause| refusal(raw, &format!("não é uma URL ({cause})")))?;
        if !matches!(url.scheme(), "http" | "https") || !url.has_host() {
            return Err(refusal(raw, "esperado http(s)://host[:porta]"));
        }
        if url.path() != "/"
            || url.query().is_some()
            || url.fragment().is_some()
            || has_credentials(&url)
        {
            return Err(refusal(
                raw,
                "só esquema://host[:porta], sem caminho, query ou usuário",
            ));
        }
        if build == BuildProfile::Release && url.scheme() != "https" {
            return Err(refusal(raw, "o site precisa de https em release"));
        }
        Ok(Self { url })
    }

    /// Whether `other` lives on this origin (scheme, host and port), never by text prefix.
    ///
    /// Example: `origin.contains(&Url::parse("https://lorkarium.app/campaigns/1")?)`
    pub fn contains(&self, other: &Url) -> bool {
        self.url.origin() == other.origin()
    }

    pub fn url(&self) -> &Url {
        &self.url
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn origin_of(raw: &str, build: BuildProfile) -> String {
        AppOrigin::parse(raw, build)
            .unwrap()
            .url()
            .as_str()
            .to_owned()
    }

    fn error_of(raw: &str, build: BuildProfile) -> String {
        AppOrigin::parse(raw, build).unwrap_err().to_string()
    }

    #[test]
    fn https_url_in_release_becomes_the_origin() {
        assert_eq!(
            origin_of("https://lorkarium.app", BuildProfile::Release),
            "https://lorkarium.app/"
        );
    }

    #[test]
    fn local_http_dev_server_is_accepted_in_debug() {
        assert_eq!(
            origin_of("http://localhost:5173", BuildProfile::Debug),
            "http://localhost:5173/"
        );
    }

    #[test]
    fn trailing_slash_keeps_the_same_origin() {
        assert_eq!(
            origin_of("https://lorkarium.app/", BuildProfile::Release),
            "https://lorkarium.app/"
        );
    }

    #[test]
    fn plain_http_in_release_is_refused_citing_the_url() {
        let message = error_of("http://lorkarium.app", BuildProfile::Release);
        assert!(message.contains("http://lorkarium.app"), "{message}");
        assert!(message.contains("https em release"), "{message}");
    }

    #[test]
    fn path_or_query_is_refused_citing_the_value() {
        let message = error_of("https://x.app/mesa?a=1", BuildProfile::Release);
        assert!(message.contains("https://x.app/mesa?a=1"), "{message}");
        assert!(message.contains("só esquema://host[:porta]"), "{message}");
    }

    #[test]
    fn path_alone_is_refused_citing_the_value() {
        let message = error_of("https://x.app/mesa", BuildProfile::Release);
        assert!(message.contains("https://x.app/mesa"), "{message}");
    }

    #[test]
    fn file_url_is_refused_citing_the_value() {
        let message = error_of("file:///c:/x", BuildProfile::Debug);
        assert!(message.contains("file:///c:/x"), "{message}");
    }

    #[test]
    fn empty_value_is_refused_saying_it_is_empty() {
        let message = error_of("", BuildProfile::Debug);
        assert!(message.contains("\"\""), "{message}");
    }
}
