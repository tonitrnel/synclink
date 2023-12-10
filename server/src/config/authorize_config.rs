use serde::Deserialize;

#[derive(Deserialize, Debug, Clone)]
pub struct AuthorizeConfig {
    pub secret: String,
}
