pub use hipstr::HipStr;

/// The common owned string representation used by JOI data types.
pub type JoiString = HipStr<'static>;

/// The common reader-writer lock used by JOI data types.
pub type JoiRwLock<T> = parking_lot::RwLock<T>;

/// A read guard acquired from [`JoiRwLock`].
pub type JoiRwLockReadGuard<'a, T> = parking_lot::RwLockReadGuard<'a, T>;
