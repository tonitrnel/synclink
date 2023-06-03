// API Design
// allocate disk resource
// `/api/upload-part?act=allocate&parts=3456,2459,358,3669,3489`
// append chunks
// `/api/upload-part?act=append&idx=3&uid: xxxx-xxxxxxxxxxxx-xxxx-xxxx`
// concatenate chunks
// `/api/upload-part?act=concatenate&uid: xxxx-xxxxxxxxxxxx-xxxx-xxxx`
#[allow(unused)]
pub async fn upload_part() {
    todo!()
}
