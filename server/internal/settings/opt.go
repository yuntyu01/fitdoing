package settings

import (
	"bytes"
	"encoding/json"
)

// Opt is a settings field that older apps do not send. Set reports whether the key was in the request:
// a missing key keeps what is stored, so an older app saving its settings does not wipe newer fields.
// An explicit null is Set with Val nil ("unknown").
type Opt[T any] struct {
	Set bool
	Val *T
}

func Some[T any](v T) Opt[T] { return Opt[T]{Set: true, Val: &v} }
func None[T any]() Opt[T]    { return Opt[T]{Set: true} }

func (o *Opt[T]) UnmarshalJSON(b []byte) error {
	o.Set = true
	if bytes.Equal(bytes.TrimSpace(b), []byte("null")) {
		o.Val = nil
		return nil
	}
	var v T
	if err := json.Unmarshal(b, &v); err != nil {
		return err
	}
	o.Val = &v
	return nil
}

func (o Opt[T]) MarshalJSON() ([]byte, error) {
	if o.Val == nil {
		return []byte("null"), nil
	}
	return json.Marshal(*o.Val)
}

// or keeps o when the request had the key, otherwise the stored value.
func (o Opt[T]) or(stored Opt[T]) Opt[T] {
	if o.Set {
		return o
	}
	return stored
}
