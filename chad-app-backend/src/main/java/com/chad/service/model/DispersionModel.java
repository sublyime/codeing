package com.chad.service.model;

import com.chad.model.DispersionInput;
import com.chad.model.DispersionResult;

public interface DispersionModel {
    DispersionResult calculate(DispersionInput input);
}
