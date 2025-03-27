use axum::extract::FromRequestParts;
use axum::http::request::Parts;
use axum::http::{HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use serde::de::value::Error;
use serde::de::DeserializeOwned;
use std::ops::Deref;

#[derive(Debug, Clone, Copy, Default)]
pub struct Header<T>(pub T);

pub struct HeaderRejection(Error);

impl IntoResponse for HeaderRejection {
    fn into_response(self) -> Response {
        (StatusCode::BAD_REQUEST, self.0.to_string()).into_response()
    }
}

impl<T> Header<T>
where
    T: DeserializeOwned,
{
    pub fn try_from_headers(headers: &HeaderMap) -> Result<Self, HeaderRejection> {
        let params = serde_header::from_headers(headers).map_err(|err| HeaderRejection(err))?;
        Ok(Header(params))
    }
}

impl<T, S> FromRequestParts<S> for Header<T>
where
    T: DeserializeOwned,
    S: Send + Sync,
{
    type Rejection = HeaderRejection;
    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        Self::try_from_headers(&parts.headers)
    }
}

impl<T> Deref for Header<T> {
    type Target = T;
    fn deref(&self) -> &Self::Target {
        &self.0
    }
}
mod serde_header {
    use axum::http::{HeaderMap, HeaderName, HeaderValue};
    use serde::de::value::MapDeserializer;
    use serde::de::{Error, IntoDeserializer, Visitor};
    use serde::{de, forward_to_deserialize_any};

    macro_rules! forward_parsed_value {
    ($($ty:ident => $method:ident,)*) => {
            $(
                fn $method<V>(self, visitor: V) -> Result<V::Value, Self::Error>
                    where V: de::Visitor<'de>
                {
                    match self.to_str()?.parse::<$ty>() {
                        Ok(val) => val.into_deserializer().$method(visitor),
                        Err(e) => Err(de::Error::custom(e))
                    }
                }
            )*
        }
    }

    pub fn from_headers<'de, T>(headers: &'de HeaderMap) -> Result<T, de::value::Error>
    where
        T: de::Deserialize<'de>,
    {
        T::deserialize(Deserializer::new(headers))
    }

    struct HeaderIterator<'de> {
        keys: Vec<&'de HeaderName>,
        cur: usize,
        inner: &'de HeaderMap,
    }
    impl<'de> Iterator for HeaderIterator<'de> {
        type Item = (NamePart<'de>, ValuePart<'de>);
        fn next(&mut self) -> Option<Self::Item> {
            if self.cur >= self.keys.len() {
                return None;
            }
            let name = self.keys[self.cur];
            self.cur += 1;
            let item = self.inner.get(name);
            item.map(|value| (NamePart(name), ValuePart(value)))
        }
    }

    struct NamePart<'de>(&'de HeaderName);
    struct ValuePart<'de>(&'de HeaderValue);
    impl<'de> NamePart<'de> {
        fn to_str(&self) -> Result<&'de str, de::value::Error> {
            Ok(self.0.as_str())
        }
    }
    impl<'de> ValuePart<'de> {
        fn to_str(&self) -> Result<&'de str, de::value::Error> {
            self.0.to_str().map_err(|err| de::value::Error::custom(err))
        }
    }
    impl<'de> de::Deserializer<'de> for NamePart<'de> {
        type Error = de::value::Error;
        fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, Self::Error>
        where
            V: Visitor<'de>,
        {
            visitor.visit_borrowed_str(self.to_str()?)
        }
        fn deserialize_option<V>(self, visitor: V) -> Result<V::Value, Self::Error>
        where
            V: Visitor<'de>,
        {
            visitor.visit_some(self)
        }
        fn deserialize_newtype_struct<V>(
            self,
            _name: &'static str,
            visitor: V,
        ) -> Result<V::Value, Self::Error>
        where
            V: Visitor<'de>,
        {
            visitor.visit_newtype_struct(self)
        }

        forward_to_deserialize_any! {
            char
            str
            string
            unit
            bytes
            byte_buf
            unit_struct
            tuple_struct
            struct
            enum
            identifier
            tuple
            ignored_any
            seq
            map
        }
        forward_parsed_value! {
            bool => deserialize_bool,
            u8 => deserialize_u8,
            u16 => deserialize_u16,
            u32 => deserialize_u32,
            u64 => deserialize_u64,
            i8 => deserialize_i8,
            i16 => deserialize_i16,
            i32 => deserialize_i32,
            i64 => deserialize_i64,
            f32 => deserialize_f32,
            f64 => deserialize_f64,
        }
    }
    impl<'de> IntoDeserializer<'de> for NamePart<'de> {
        type Deserializer = Self;
        fn into_deserializer(self) -> Self::Deserializer {
            self
        }
    }
    impl<'de> de::Deserializer<'de> for ValuePart<'de> {
        type Error = de::value::Error;
        fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, Self::Error>
        where
            V: Visitor<'de>,
        {
            visitor.visit_borrowed_str(self.to_str()?)
        }
        fn deserialize_option<V>(self, visitor: V) -> Result<V::Value, Self::Error>
        where
            V: Visitor<'de>,
        {
            visitor.visit_some(self)
        }
        fn deserialize_newtype_struct<V>(
            self,
            _name: &'static str,
            visitor: V,
        ) -> Result<V::Value, Self::Error>
        where
            V: Visitor<'de>,
        {
            visitor.visit_newtype_struct(self)
        }
        forward_to_deserialize_any! {
            char
            str
            string
            unit
            bytes
            byte_buf
            unit_struct
            tuple_struct
            struct
            enum
            identifier
            tuple
            ignored_any
            seq
            map
        }
        forward_parsed_value! {
            bool => deserialize_bool,
            u8 => deserialize_u8,
            u16 => deserialize_u16,
            u32 => deserialize_u32,
            u64 => deserialize_u64,
            i8 => deserialize_i8,
            i16 => deserialize_i16,
            i32 => deserialize_i32,
            i64 => deserialize_i64,
            f32 => deserialize_f32,
            f64 => deserialize_f64,
        }
    }
    impl<'de> IntoDeserializer<'de> for ValuePart<'de> {
        type Deserializer = Self;
        fn into_deserializer(self) -> Self::Deserializer {
            self
        }
    }

    struct Deserializer<'de> {
        inner: MapDeserializer<'de, HeaderIterator<'de>, de::value::Error>,
    }
    impl<'de> Deserializer<'de> {
        fn new(input: &'de HeaderMap) -> Self {
            Deserializer {
                inner: MapDeserializer::new(HeaderIterator {
                    keys: input.keys().collect(),
                    cur: 0,
                    inner: input,
                }),
            }
        }
    }
    impl<'de, 'a> de::Deserializer<'de> for Deserializer<'de> {
        type Error = de::value::Error;

        fn deserialize_any<V>(self, visitor: V) -> Result<V::Value, Self::Error>
        where
            V: Visitor<'de>,
        {
            self.deserialize_map(visitor)
        }
        fn deserialize_unit<V>(self, visitor: V) -> Result<V::Value, Self::Error>
        where
            V: Visitor<'de>,
        {
            visitor.visit_unit()
        }
        fn deserialize_seq<V>(self, visitor: V) -> Result<V::Value, Self::Error>
        where
            V: Visitor<'de>,
        {
            visitor.visit_seq(self.inner)
        }
        fn deserialize_map<V>(self, visitor: V) -> Result<V::Value, Self::Error>
        where
            V: Visitor<'de>,
        {
            visitor.visit_map(self.inner)
        }

        forward_to_deserialize_any! {
            bool
            u8
            u16
            u32
            u64
            i8
            i16
            i32
            i64
            f32
            f64
            char
            str
            string
            option
            bytes
            byte_buf
            unit_struct
            newtype_struct
            tuple_struct
            struct
            identifier
            tuple
            enum
            ignored_any
        }
    }
}
