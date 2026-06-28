package domain

// CadenceSpec is a poll cadence as min/max values (plain seconds or expressions).
type CadenceSpec struct {
	Min string
	Max string
}
